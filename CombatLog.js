"use strict";
const events = require('events');
const fs = require('fs/promises');
const readline = require('readline');
const path = require('path');

class CombatLog
{
   static logVersion = 1;
   static rexLine = /^\[(?<timestamp>[^\]]*)] \[(?<subject>[^\]]*)] \[(?<object>[^\]]*)] \[(?<action>[^\]]*)] \[(?<effect>[^\]]*)](?: \((?<detail1>[^\]]*)\))?(?: <(?<detail2>[^\]]*)>)?/;
   
   constructor(dir, file, parent)
   {
      this.parent = parent;
      this.dir = dir;
      this.filepath = (dir == "." ? file : (dir.endsWith("/") || dir.endsWith("\\") ? dir + file : dir + path.sep + file));
      this.parsed = false;
      this.filename = file;
      this.areas = [];
      this.enemies = [];
      this.players = [];
   }
   
   async parse(force)
   {
      if(this.parsed && !force)
         return true;
      
      let fh;
      try
      {
         fh = await fs.open(this.filepath);
         const rl = readline.createInterface({
            input: fh.createReadStream(),
            crlfDelay: Infinity
         });

         rl.on("line", (line) => {
            let lineData = line.match(CombatLog.rexLine).groups;
            if(lineData.action.startsWith("Safe Login") && !this.character)
            {
               this.character = CombatLog.parseEntity(lineData.subject);
            }
            else if(lineData.effect.startsWith("AreaEntered"))
            {
               if(!this.serverId)
               {
                  this.serverId = lineData.detail1;
                  switch(this.serverId)
                  {
                     case "he3000":
                        this.server = "Star Forge";
                        break;
                     case "he3001":
                        this.server = "Satele Shan";
                        break;
                     case "he4000":
                        this.server = "Darth Malgus";
                        break;
                     case "he4001":
                        this.server = "Tulak Hord";
                        break;
                     case "he4002":
                        this.server = "The Leviathan";
                        break;
                     case "HE600":
                        this.server = "PTS";
                        break;
                  }
               }
               if(!this.patch)
                  this.patch = lineData.detail2;
               let effectData = CombatLog.parseEffect(lineData.effect);
               let areaData = {
                  area: effectData.specific,
                  areaId: effectData.specificId,
                  unique: effectData.specificId,
               };
               if(effectData.modifier)
               {
                  areaData.mode = effectData.modifier;
                  areaData.modeId = effectData.modifierId;
                  areaData.unique = areaData.unique + ":" + effectData.modifierId;
               }
               CombatLog.addUnique(this.areas, areaData, "unique");
            }
            else if(lineData.effect.indexOf("{836045448945501}") > -1) // Damage dealt
            {
               let source = CombatLog.parseEntity(lineData.subject);
               let target = CombatLog.parseEntity(lineData.object);
               if(source.unique == this.character.unique)
                  CombatLog.addUnique(this.enemies, target, "unique");
               else if(target.unique == this.character.unique)
                  CombatLog.addUnique(this.enemies, source, "unique");
               
               if(source.isPC && source.unique != this.character.unique)
                  CombatLog.addUnique(this.players, source, "unique");
               if(target.isPC && target.unique != this.character.unique)
                  CombatLog.addUnique(this.players, target, "unique");
            }
            else if(lineData.effect.indexOf("{836045448945500}") > -1) // Healing dealt
            {
               let source = CombatLog.parseEntity(lineData.subject);
               let target = CombatLog.parseEntity(lineData.object);
               if(source.isPC && source.unique != this.character.unique)
                  CombatLog.addUnique(this.players, source, "unique");
               if(target.isPC && target.unique != this.character.unique)
                  CombatLog.addUnique(this.players, target, "unique");
            }
         });

         await events.once(rl, "close");
      }
      catch(err)
      {
         console.error(err);
      }
      finally
      {
         await fh?.close();
      }
      
      if(!this.parsed)
      {
         this.parsed = true;
         this.parent.parsed++;
      }
      this.parent.events.emit("logParsed", this);
      if(this.parent.parsed == this.parent.logs.length)
         this.parent.events.emit("allLogsParsed");
      return this.parsed;
   }
   
   static addUnique(array, newItem, property=null, replace=false)
   {
      if(!newItem || (property && !newItem[property]))
         return -1;
      let found = -1;
      for(let i in array)
      {
         if(property && array[i][property] == newItem[property])
         {
            found = i;
            break;
         }
         else if(!property && array[i] == newItem)
         {
            found = i;
            break;
         }
      }
      if(found == -1)
      {
         array.push(newItem);
         return array.length-1;
      }
      else
      {
         if(replace)
            array[i] = newItem;
         return found;
      }
   }
   
   static parseEntity(string)
   {
      if(string == "=")
         return {referToSubject:true};
      let result = {
         isPC: false,
         isCompanion: false,
      };
      let entity, positionString, hpString;
      [entity, positionString, hpString] = string.split("|", 3);
      /*if(positionString)
      {
         result.pos = {};
         [result.pos.x, result.pos.y, result.pos.z, result.pos.r] = positionString.slice(1, -1).split(",", 4);
      }
      if(hpString)
      {
         result.hp = {};
         [result.hp.current, result.hp.max] = hpString.slice(1, -1).split("/", 2);
      }*/
      if(entity.startsWith("@"))
      {
         result.isPC = true;
         let characterString, companionString;
         [characterString, companionString] = entity.split("/", 2);
         [result.name, result.id] = characterString.slice(1).split("#", 2);
         if(companionString)
         {
            result.isCompanion = true;
            let parsed = CombatLog.parseId(companionString);
            if(parsed.instanceId)
            {
               result.instanceId = parsed.instanceId;
               result.unique = parsed.id +":"+ parsed.instanceId;
            }
            else
               result.unique = parsed.id;
            result.pcName = result.name;
            result.pcId = result.id;
            result.name = parsed.name;
            result.id = parsed.id;
         }
         else
         {
            result.unique = result.id;
         }
      }
      else
      {
         let parsed = CombatLog.parseId(entity);
         result.name = parsed.name;
         result.id = parsed.id;
         if(parsed.instanceId)
            result.instanceId = parsed.instanceId;
         result.unique = result.id;
      }
      return result;
   }
   
   static parseId(string)
   {
      let result = {};
      let idxBracketOpen, idxBracketClose;
      idxBracketOpen = string.indexOf("{");
      result.name = string.slice(0, idxBracketOpen-1);
      idxBracketClose = string.indexOf("}", idxBracketOpen);
      result.id = string.slice(idxBracketOpen+1, idxBracketClose);
      if(string.length > idxBracketClose+1)
      {
         if(string[idxBracketClose+1] == ":" && string.indexOf(" ", idxBracketClose+2) == -1)
            result.instanceId = string.slice(idxBracketClose+2);
         else
            result.remainder = string.slice(idxBracketClose+1);
      }
      return result;
   }
   
   static parseEffect(string)
   {
      let result = {};
      let typeString, specificString;
      [typeString, specificString] = string.split(": ", 2);
      let parsedType = CombatLog.parseId(typeString);
      result.type = parsedType.name;
      result.typeId = parsedType.id;
      let parsedSpecific = CombatLog.parseId(specificString);
      result.specific = parsedSpecific.name;
      result.specificId = parsedSpecific.id;
      if(parsedSpecific.remainder)
      {
         let parsedModifier = CombatLog.parseId(parsedSpecific.remainder.trimStart());
         result.modifier = parsedModifier.name;
         result.modifierId = parsedModifier.id;
      }
      return result;
   }
   
   simplify()
   {
      return {
         filename: this.filename,
         areas: this.areas,
         enemies: this.enemies,
         players: this.players,
         character: this.character,
         server: this.server,
         serverId: this.serverId,
         patch: this.patch,
      };
   }
}

module.exports = {
   CombatLog: CombatLog
};
