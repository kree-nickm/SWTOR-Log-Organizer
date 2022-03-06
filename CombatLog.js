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
      this.instances = [];
      this.enemies = [];
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
            //let parsed = CombatLog.parseLine(line);
            
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
               let add = true;
               for(let instance of this.instances)
               {
                  if(instance == effectData.targetString)
                  {
                     add = false;
                     break;
                  }
               }
               if(add)
                  this.instances.push(effectData.targetString);
            }
            else if(lineData.effect.indexOf("{836045448945501}") > -1)
            {
               let source = CombatLog.parseEntity(lineData.subject);
               let target = CombatLog.parseEntity(lineData.object);
               let enemy;
               if(source.character == this.character.character)
                  enemy = target.characterString;
               else if(target.character == this.character.character)
                  enemy = source.characterString;
               if(enemy)
               {
                  let add = true;
                  for(let e of this.enemies)
                  {
                     if(e == enemy)
                     {
                        add = false;
                        break;
                     }
                  }
                  if(add)
                     this.enemies.push(enemy);
               }
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
   
   static parseEntity(string)
   {
      let result = {};
      [result.subject, result.position, result.hp] = string.split("|");
      if(result.subject.startsWith("@"))
      {
         [result.characterFullString, result.companionFullString] = result.subject.split("/", 2);
         result.characterString = result.characterFullString;
         [result.character, result.characterId] = result.characterString.substring(1).split("#", 2);
         if(result.companionFullString)
         {
            [result.companionString, result.companionInst] = result.companionFullString.split(":", 2);
            let idStart = result.companionString.indexOf("{");
            result.companion = result.companionString.substring(0, idStart-1);
            result.companionId = result.companionString.substring(idStart+1, result.companionString.length-1);
         }
         else
            delete result.companionFullString;
      }
      else
      {
         result.characterFullString = result.subject;
         [result.characterString, result.characterInst] = result.subject.split(":", 2);
         let idStart = result.characterString.indexOf("{");
         result.character = result.characterString.substring(0, idStart-1);
         result.characterId = result.characterString.substring(idStart+1, result.characterString.length-1);
      }
      return result;
   }
   
   static parseEffect(string)
   {
      let result = {};
      [result.typeString, result.targetString] = string.split(": ", 2);
      /*let idStart = result.typeString.indexOf("{");
      result.type = result.typeString.substring(0, idStart-1);
      result.typeId = result.typeString.substring(idStart+1, result.typeString.length-1);
      idStart = result.targetString.indexOf("{");
      result.target = result.targetString.substring(0, idStart-1);
      result.targetId = result.targetString.substring(idStart+1, result.targetString.length-1);*/
      return result;
   }
   
   simplify()
   {
      return {
         filename: this.filename,
         instances: this.instances,
         enemies: this.enemies,
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
