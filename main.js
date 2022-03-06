"use strict";
const { app, BrowserWindow, Menu, MenuItem, dialog, ipcMain } = require('electron');
const events = require('events');
const fs = require('fs/promises');
const path = require('path');
const { CombatLog } = require("./CombatLog.js");

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
      combatLogs.logs.push(new CombatLog(dir, file, combatLogs));
   });
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
      combatLogs.events.on("logParsed", (log) => {
         console.log(log.simplify());
      });
      combatLogs.events.on("allLogsParsed", () => {
         console.log("All Logs Parsed.");
      });
      await findAllLogs();
      for(let log of combatLogs.logs)
      {
         log.parse();
         break;
      }
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
