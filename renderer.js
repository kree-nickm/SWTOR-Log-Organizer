const Renderer = new (function(){
	this.contextMenu = [];
	
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
			this.addToContextMenu("zoomin", "Inspect Element", event => { window.electronAPI.inspectElement(menu.offset()); }, true);
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

window.electronAPI.populateLogList((event, logs, references) => {
   logs = JSON.parse(logs);
   let logListBody = $("#logListBody");
   logListBody.empty();
   for(let log of logs)
   {
      logListBody.append("<tr></tr>");
      let row = logListBody.children().last();
      row.append(`<td>${log.filename}</td>`);
      row.append(`<td>${log.server}</td>`);
      row.append(`<td>${log.patch}</td>`);
      row.append(`<td>${references[log.character]?.name}</td>`);
      let areas = log.areas.reduce((previousValue, currentValue) => previousValue + (previousValue ? "<br/>" : "") + currentValue.area + (currentValue.mode? " ("+ currentValue.mode +")" :""), "");
      row.append(`<td><div class="scroll-list">${areas}</div></td>`);
      let players = log.players.reduce((previousValue, currentValue) => previousValue + (previousValue ? "<br/>" : "") + references[currentValue].name + (references[currentValue].pcName? " ("+ references[currentValue].pcName +")" :""), "");
      row.append(`<td><div class="scroll-list">${players}</div></td>`);
   }
});

$(document).on("contextmenu", event => {
	Renderer.showContextMenu(true);
});
$(document).on("click", event => {
	Renderer.showContextMenu(false);
});
$("#contextmenu").menu();
