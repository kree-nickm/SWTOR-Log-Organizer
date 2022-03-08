"use strict";
const { app, BrowserWindow, Menu, MenuItem, dialog, ipcMain } = require('electron');
const path = require('path');
const { CombatLogCollection, CombatLog } = require("./CombatLog.js");

const appWindows = [];

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

var pageReady = false;
var logsReady = false;
const combatLogs = new CombatLogCollection();
combatLogs.events.on("allLogsFound", () => {
   console.log("All logs identified.");
});
combatLogs.events.on("logCacheLoaded", () => {
   console.log("Log cache loaded.");
});
combatLogs.events.on("logParsed", (log) => {
   //console.log(log);
});
combatLogs.events.on("allLogsParsed", () => {
   console.log("All Logs Parsed.");
   if(combatLogs.cacheUnsaved)
      combatLogs.saveCache();
   logsReady = true;
   if(pageReady)
      everythingReady();
});
combatLogs.events.on("logCacheSaved", () => {
   console.log("Log cache saved.");
});
combatLogs.init();

function everythingReady()
{
   appWindows[0].webContents.send("logList", JSON.stringify(combatLogs.logList));
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
		show: false,
		title: "SWTOR Log Organizer",
		webPreferences: {
         // Note: This is the quick-and-dirty way. Probably fine since this app doesn't load external web pages.
			nodeIntegration: true,
         contextIsolation: false,
		}
	});

	appWindows[0].once("ready-to-show", () => { appWindows[0].show() });
	appWindows[0].loadFile("index.html");
	appWindows[0].on("closed", () => {
		for(let i in appWindows)
			appWindows[i] = null;
	});
	appWindows[0].webContents.on("dom-ready", async () => {
      pageReady = true;
      if(logsReady)
         everythingReady();
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
