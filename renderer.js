const { ipcRenderer } = require('electron');
const fs = require('fs');
const $ = jQuery = require('jquery');
require("./node_modules/jquery-ui-dist/jquery-ui.min.js");

const Renderer = new (function(){
	this.stringCollator = new Intl.Collator("en");
	this.requiredFiles = {};
	this.contextMenu = [];
	
	this.send = function(channel, data)
	{
		ipcRenderer.send(channel, data);
	}
	
	this.requireFile = function(nodeFile, withTime)
	{
		if(fs.existsSync(nodeFile))
		{
			let stat = fs.statSync(nodeFile);
			let modTime = stat.mtimeMs;
			if(!this.requiredFiles[nodeFile] || modTime > this.requiredFiles[nodeFile])
			{
				let resolve = require.resolve("./"+ nodeFile);
				if(require.cache[resolve])
					delete require.cache[resolve];
				this.requiredFiles[nodeFile] = modTime;
			}
			if(withTime)
				return {module:require("./"+ nodeFile), time:this.requiredFiles[nodeFile]};
			else
				return require("./"+ nodeFile);
		}
		else
			throw "Tried to load non-existent Node.js file '"+ nodeFile +"'.";
	};
	
	this.addToContextMenu = function(icon, text, action, divider)
	{
		for(let i in this.contextMenu)
		{
			if(this.contextMenu[i].action == action)
			{
				this.contextMenu[i].icon = icon;
				this.contextMenu[i].text = text;
				return this.contextMenu.length;
			}
		}
		if(this.contextMenu.length && divider)
			this.contextMenu.push({divider: true});
		this.contextMenu.push({icon:icon, text:text, action:action});
		return this.contextMenu.length;
	};
	
	this.showContextMenu = function(show)
	{
		let menu = $("#contextmenu");
		if(show)
		{
			this.addToContextMenu("zoomin", "Inspect Element", event => { Renderer.send("inspect", menu.offset()); }, true);
			menu.addClass("showing").offset({left:event.pageX, top:event.pageY}).html("");
			for(let i in this.contextMenu)
			{
				if(this.contextMenu[i].divider)
					menu.append("<li class=\"ui-state-disabled\"><hr/></li>");
				else
				{
					menu.append("<li><div><span class=\"ui-icon ui-icon-"+ this.contextMenu[i].icon +"\"></span> "+ this.contextMenu[i].text +"</div></li>")
					.children().last().click(this.contextMenu[i].action);
				}
			}
			menu.menu("refresh");
		}
		else
		{
			menu.removeClass("showing");
		}
		this.contextMenu = [];
	};
})();

$(document).on("contextmenu", event => {
	Renderer.showContextMenu(true);
});
$(document).on("click", event => {
	Renderer.showContextMenu(false);
});
$("#contextmenu").menu();

function sortByTitle(a, b) {
	if(!a.t && !b.t)
		return 0;
	else if(!a.t)
		return 1;
	else if(!b.t)
		return -1;
	else
		return Renderer.stringCollator.compare(a.t, b.t);
}
function sortByID(a, b) {
	if(!a.id && !b.id)
		return 0;
	else if(!a.id)
		return 1;
	else if(!b.id)
		return -1;
	else
		return Renderer.stringCollator.compare(a.id, b.id);
}
