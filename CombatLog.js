"use strict";
const events = require('events');
const fs = require('fs');
const fsPromises = require('fs/promises');
const readline = require('readline');
const path = require('path');

class CombatLogCollection
{
   constructor(dir=__dirname)
   {
      dir = path.normalize(dir);
      if(dir == ".")
         this.dir = __dirname;
      else if(path.isAbsolute(dir))
         this.dir = dir;
      else
         this.dir = path.join(__dirname, dir);
      this.logsParsed = 0;
      this.logList = [];
      this.loadedCache = null;
      this.cacheUnsaved = false;
      this.events = new events.EventEmitter();
   }
   
   async init()
   {
      await Promise.all([this.findAllLogs(), this.loadCache()]).then(([numLogs, numCached]) => {
         console.log("Parsing logs.");
         return this.parseAll();
      }).then(() => {
         this.events.emit("ready");
      });
   }
   
   toJSON(key)
   {
      return {
         dir: this.dir,
         logList: this.logList,
         logVersion: CombatLog.logVersion,
      };
   }
   
   async findAllLogs()
   {
      let files = await fsPromises.readdir(this.dir);
      files.forEach(file => {
         if (!file.startsWith("combat_") || !file.endsWith(".txt"))
            return;
         for(let log of this.logList)
            if(log.filename == file)
               return;
         this.logList.push(new CombatLog(file, this));
      });
      this.events.emit("allLogsFound");
      return this.logList.length;
   }
   
	async loadCache()
   {
		try
		{
			this.loadedCache = JSON.parse(await fsPromises.readFile("logDataCache.json"));
		}
		catch(err)
		{
			if(err.code == "ENOENT")
			{
            this.loadedCache = {};
			}
			else
				throw err;
		}
      this.events.emit("logCacheLoaded");
      return this.loadedCache?.logList?.length;
	}
   
   async saveCache()
   {
      await fsPromises.writeFile("logDataCache.json", JSON.stringify(this));
      this.cacheUnsaved = false;
      this.events.emit("logCacheSaved");
   }
   
   async parseAll()
   {
      for(let log of this.logList)
      {
         await log.parse();
      }
      this.events.emit("allLogsParsed");
   }
}

class CombatLog
{
   static cachedProperties = [
      'filename',
      'filesize',
      'patch',
      'server',
      'serverId',
      'areas',
      'character',
      'players',
      'enemies',
   ];
   static logVersion = 3;
   static rexLine = /^\[(?<timestamp>[^\]]*)] \[(?<subject>[^\]]*)] \[(?<object>[^\]]*)] \[(?<action>[^\]]*)] \[(?<effect>[^\]]*)](?: \((?<detail1>[^\]]*)\))?(?: <(?<detail2>[^\]]*)>)?/;
   
   constructor(file, parent)
   {
      this.parent = parent;
      this.filename = file;
      this.filepath = path.join(parent.dir, file);
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
   
   toJSON(key)
   {
      return CombatLog.cachedProperties.reduce((previousValue, currentValue) => {
         previousValue[currentValue] = this[currentValue];
         return previousValue;
      }, {});
   }
   
   async parse(force)
   {
      let already = false;
      if(this.parsed && !force)
      {
         console.log("Already parsed "+ this.filename);
         already = true;
      }
      else if(CombatLog.logVersion == this.parent.loadedCache?.logVersion)
      {
         for(let cached of this.parent.loadedCache.logList)
         {
            if(cached.filename == this.filename && cached.filesize == this.filesize)
            {
               console.log("Using cached "+ this.filename);
               already = true;
               for(let prop of CombatLog.cachedProperties)
                  this[prop] = cached[prop];
            }
         }
      }
      
      if(!already)
      {
         this.parent.cacheUnsaved = true;
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
         this.parent.logsParsed++;
      }
      this.parent.events.emit("logParsed", this);
      return this;
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
   CombatLogCollection: CombatLogCollection,
   CombatLog: CombatLog,
};
