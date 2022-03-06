"use strict";
const { app, BrowserWindow, Menu, MenuItem, dialog, ipcMain } = require('electron');
const events = require('events');
const fs = require('fs/promises');
const readline = require('readline');
const path = require('path');

const appWindows = [];
const combatLogs = {
   parsed: 0,
   logs: [],
   events: new events.EventEmitter(),
};

app.whenReady().then(async () => {
	createWindow();
	app.on("activate", function(){
		if(appWindows[0] === null)
			createWindow();
	});
}).catch(console.error);

app.on("window-all-closed", () => {
	if(process.platform !== "darwin")
		app.quit();
});

ipcMain.on("inspect", (event, data) => {
	appWindows[0].webContents.inspectElement(Math.round(data.left), Math.round(data.top));
});

async function findAllLogs()
{
   let dir = ".";
	let files = await fs.readdir(dir);
   files.forEach(file => {
      if (!file.startsWith("combat_") || !file.endsWith(".txt"))
         return;
      for(let log of combatLogs.logs)
         if(log.filename == file)
            return;
      let filepath;
      if(dir == ".")
         filepath = file;
      
      combatLogs.logs.push({
         filename: file,
         filepath: (dir == "." ? file : (dir.endsWith("/") || dir.endsWith("\\") ? dir + file : dir + path.sep + file)),
         instances: [],
         enemies: [],
         parsed: false
      });
   });
}

async function parseLog(idx, force)
{
   if(combatLogs.logs.length <= idx)
   {
      console.error("Log index out of range.");
      return false;
   }
   if(combatLogs.logs[idx].parsed && !force)
      return true;
   
   let fh;
   try
   {
      fh = await fs.open(combatLogs.logs[idx].filepath);
      const rl = readline.createInterface({
         input: fh.createReadStream(),
         crlfDelay: Infinity
      });

      rl.on("line", (line) => {
         let parsed = parseLine(line);
         if(parsed.type == "Login")
         {
            if(!combatLogs.logs[idx].character)
               combatLogs.logs[idx].character = parsed.character;
         }
         if(parsed.type == "AreaEntered")
         {
            if(!combatLogs.logs[idx].serverId)
            {
               combatLogs.logs[idx].serverId = parsed.serverId;
               switch(parsed.serverId)
               {
                  case "he3000":
                     combatLogs.logs[idx].server = "Star Forge";
                     break;
                  case "he3001":
                     combatLogs.logs[idx].server = "Satele Shan";
                     break;
                  case "he4000":
                     combatLogs.logs[idx].server = "Darth Malgus";
                     break;
                  case "he4001":
                     combatLogs.logs[idx].server = "Tulak Hord";
                     break;
                  case "he4002":
                     combatLogs.logs[idx].server = "The Leviathan";
                     break;
                  case "HE600":
                     combatLogs.logs[idx].server = "PTS";
                     break;
               }
            }
            if(!combatLogs.logs[idx].version)
               combatLogs.logs[idx].version = parsed.version;
            let add = true;
            for(let instance of combatLogs.logs[idx].instances)
            {
               if(instance == parsed.instance)
               {
                  add = false;
                  break;
               }
            }
            if(add)
               combatLogs.logs[idx].instances.push(parsed.instance);
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
   
   if(!combatLogs.logs[idx].parsed)
   {
      combatLogs.logs[idx].parsed = true;
      combatLogs.parsed++;
   }
   combatLogs.events.emit("logParsed", idx);
   if(combatLogs.parsed == combatLogs.logs.length)
      combatLogs.events.emit("allLogsParsed");
   return combatLogs.logs[idx].parsed;
}

function parseLine(line)
{
   let result = {type:null};
   
   let login = line.indexOf("Safe Login");
   if(login > -1)
   {
      result.type = "Login";
      let source1 = line.indexOf("@");
      let source2a = line.indexOf("#", source1+2); // post-7.0
      let source2b = line.indexOf("]", source1+2); // pre-7.0
      let source2 = Math.min(source2a, source2b);
      result.character = line.substring(source1+1, source2);
   }
   
   // post-7.0 only
   let areaEntered = line.indexOf("AreaEntered");
   if(areaEntered > -1)
   {
      result.type = "AreaEntered";
      let area1 = line.indexOf(":", areaEntered+15);
      let area2 = line.indexOf("]", area1+7);
      result.instance = line.substring(area1+2, area2);
      let server1 = line.indexOf("(", area2+2);
      let server2 = line.indexOf(")", server1+3);
      result.serverId = line.substring(server1+1, server2);
      let patch1 = line.indexOf("<", server2+2);
      let patch2 = line.indexOf(">", patch1+2);
      result.version = line.substring(patch1+1, patch2);
   }
   
   let damage = line.indexOf("{836045448945501}");
   if(damage > -1)
   {
   }
   
	return result;
}

async function showMessage(props)
{
	switch(props.type)
	{
		case "error":
			console.error(props);
			break;
		case "warning":
			console.warn(props);
			break;
		case "question":
			break;
		default:
			console.log(props);
	}
	if(appWindows[0])
		return await dialog.showMessageBox(appWindows[0], props);
	else
		return null;
}

async function createWindow()
{
	appWindows[0] = new BrowserWindow({
		width: 1500,
		height: 1050,
		webPreferences: {
			nodeIntegration: true,
			//preload: path.join(__dirname, 'preload.js')
		}
	});

	appWindows[0].loadFile("index.html");
	appWindows[0].on("closed", () => {
		for(let i in appWindows)
			appWindows[i] = null;
	});
	appWindows[0].webContents.on("dom-ready", async () => {
      combatLogs.events.on("logParsed", (idx) => {
         console.log(combatLogs.logs[idx]);
      });
      combatLogs.events.on("allLogsParsed", () => {
         console.log("All Logs Parsed.");
      });
      await findAllLogs();
      for(let i in combatLogs.logs)
         parseLog(i);
	});
	
	let menu = new Menu();
	
	let fileMenu = new MenuItem({
		label: "File",
		accelerator: "Alt+F",
		type: "submenu",
		submenu: new Menu(),
	});
	fileMenu.submenu.append(new MenuItem({
		label: "Exit",
		accelerator: "CommandOrControl+Q",
		type: "normal",
		click: () => {app.quit()},
	}));
	menu.append(fileMenu);
	
	let toolsMenu = new MenuItem({
		label: "Tools",
		accelerator: "Alt+T",
		type: "submenu",
		submenu: new Menu(),
	});
	toolsMenu.submenu.append(new MenuItem({
		label: "Dev Tools",
		accelerator: "CommandOrControl+Shift+I",
		type: "normal",
		click: () => {appWindows[0].webContents.openDevTools();},
	}));
	menu.append(toolsMenu);
	
	Menu.setApplicationMenu(menu);
}
