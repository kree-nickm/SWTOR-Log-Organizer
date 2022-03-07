"use strict";
const events = require('events');
const fs = require('fs');
const fsPromises = require('fs/promises');
const readline = require('readline');
const path = require('path');

class CombatLog
{
   static logVersion = 3;
   static logsParsed = 0;
   static logList = [];
   static logListPopulated = false;
   static loadedCache = null;
   static events = new events.EventEmitter();
   static rexLine = /^\[(?<timestamp>[^\]]*)] \[(?<subject>[^\]]*)] \[(?<object>[^\]]*)] \[(?<action>[^\]]*)] \[(?<effect>[^\]]*)](?: \((?<detail1>[^\]]*)\))?(?: <(?<detail2>[^\]]*)>)?/;
   
   static async findAllLogs(dir=".")
   {
      let files = await fsPromises.readdir(dir);
      files.forEach(file => {
         if (!file.startsWith("combat_") || !file.endsWith(".txt"))
            return;
         for(let log of CombatLog.logList)
            if(log.filename == file)
               return;
         CombatLog.logList.push(new CombatLog(dir, file));
      });
      CombatLog.logListPopulated = true;
      CombatLog.events.emit("allLogsFound");
      CombatLog.checkParseReady();
   }
   
	static async loadCache()
   {
		try
		{
			CombatLog.loadedCache = JSON.parse(await fsPromises.readFile("logDataCache.json"));
		}
		catch(err)
		{
			if(err.code == "ENOENT")
			{
            CombatLog.loadedCache = {};
			}
			else
				throw err;
		}
      CombatLog.events.emit("logCacheLoaded");
      CombatLog.checkParseReady();
	}
   
   static async checkParseReady()
   {
      if(CombatLog.loadedCache != null && CombatLog.logListPopulated)
         CombatLog.events.emit("readyToParse");
   }
   
   static async saveCache()
   {
      await fsPromises.writeFile("logDataCache.json", JSON.stringify({
         logVersion: CombatLog.logVersion,
         logList: CombatLog.logList,
      }));
      CombatLog.events.emit("logCacheSaved");
   }
   
   constructor(dir, file)
   {
      this.filename = file;
      this.dir = dir;
      this.filepath = (dir == "." ? file : (dir.endsWith("/") || dir.endsWith("\\") ? dir + file : dir + path.sep + file));
      let stat = fs.statSync(this.filepath);
      this.filesize = stat.size;
      this.parsed = false;
      
      this.patch = "";
      this.server = "";
      this.serverId = "";
      this.areas = [];
      this.character = null;
      this.players = [];
      this.enemies = [];
   }
   
   async parse(force)
   {
      if(this.parsed && !force)
         return true;
      let already = false;
      if(CombatLog.logVersion == CombatLog.loadedCache?.logVersion)
      {
         for(let cached of CombatLog.loadedCache.logList)
         {
            if(cached.filename == this.filename && cached.filesize == this.filesize)
            {
               console.log("Using cached "+ this.filename);
               already = true;
               this.patch = cached.patch;
               this.server = cached.server;
               this.serverId = cached.serverId;
               this.areas = cached.areas;
               this.character = cached.character;
               this.players = cached.players;
               this.enemies = cached.enemies;
            }
         }
      }
      if(!already)
      {
         let fh;
         let rl;
         try
         {
            fh = await fsPromises.open(this.filepath);
            rl = readline.createInterface({
               input: fh.createReadStream({
                  encoding: "utf8",
               }),
               crlfDelay: Infinity,
            });

            rl.on("line", (line) => {
               let lineData = line.match(CombatLog.rexLine)?.groups;
               if(lineData)
               {
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
                     };
                     if(effectData.modifier)
                     {
                        areaData.mode = effectData.modifier;
                        areaData.modeId = effectData.modifierId;
                     }
                     let found = -1;
                     for(let i in this.areas)
                     {
                        if(this.areas[i].areaId == areaData.areaId)
                        {
                           /* Possibilities to check:
                              neither have a mode, or new one has no mode -> skip duplicate
                              only new one has a mode -> overwrite
                              both have same mode -> skip duplicate
                              both have different modes -> not a duplicate, keep going
                           */
                           if(!areaData.modeId)
                           {
                              found = i;
                              break;
                           }
                           else if(!this.areas[i].modeId)
                           {
                              found = i;
                              this.areas[i] = areaData;
                              break;
                           }
                           else if(areaData.modeId == this.areas[i].modeId)
                           {
                              found = i;
                              break;
                           }
                        }
                     }
                     if(found == -1)
                     {
                        this.areas.push(areaData);
                     }
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
               }
               else
                  console.warn("Unable to parse line: ", line);
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
         console.log("Parsed "+ this.filename);
      }
      
      if(!this.parsed)
      {
         this.parsed = true;
         CombatLog.logsParsed++;
      }
      CombatLog.events.emit("logParsed", this);
      if(CombatLog.logsParsed == CombatLog.logList.length)
         CombatLog.events.emit("allLogsParsed");
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
   
   static parseEntity(string, includeDetails=false)
   {
      if(string == "=")
         return {referToSubject:true};
      let result = {
         isPC: false,
         isCompanion: false,
      };
      let entity, positionString, hpString;
      [entity, positionString, hpString] = string.split("|", 3);
      if(positionString && includeDetails)
      {
         result.pos = {};
         [result.pos.x, result.pos.y, result.pos.z, result.pos.r] = positionString.slice(1, -1).split(",", 4);
      }
      if(hpString && includeDetails)
      {
         result.hp = {};
         [result.hp.current, result.hp.max] = hpString.slice(1, -1).split("/", 2);
      }
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
            //if(parsed.instanceId)
            //   result.instanceId = parsed.instanceId;
            result.pcName = result.name;
            result.pcId = result.id;
            result.name = parsed.name;
            result.id = parsed.id;
            result.unique = result.pcId + ":" + result.id;
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
         //if(parsed.instanceId)
         //   result.instanceId = parsed.instanceId;
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
}

module.exports = {
   CombatLog: CombatLog
};
