"use strict";

//retrieve and store settings (filled with default values):
var w = {};
chrome.storage.sync.get( null, function(storage){
	w = {
	"conflictAction":	(!storage["conflictAction"] ? "prompt"	: storage["conflictAction"]),
	"defaultPath"	:	(!storage["defaultPath"] 	? ""		: storage["defaultPath"]),
	"rules_both" 	:	(!storage["rules_both"]		? [] 		: storage["rules_both"]),
	"rules_url" 	:	(!storage["rules_url"]		? [] 		: storage["rules_url"]),
	"rules_ext" 	:	(!storage["rules_ext"]		? [] 		: storage["rules_ext"])
	};
});

chrome.downloads.onCreated.addListener( function(d){ console.log("onCreated", d); } );	 // investigating DNA-15285

chrome.downloads.onDeterminingFilename.addListener( function(download, suggest){ // determine correct location

	var path = "";
	var filetype = download.filename.substring(download.filename.lastIndexOf(".")+1);
	
	// check for matching rules with URL and file type first:
	for(var i = 0; i < w.rules_both.length; i++)
	{
		var regex = new RegExp(w.rules_both[i].url, "i"); // i = matches lower- & uppercase
		if(regex.test(download.url) && w.rules_both[i].ext.indexOf(filetype) !== -1)
		{
			path = w.rules_both[i].dir;
			break;
		}
	}
	
	// if no rules matched, check for URL only:
	if(path === "") for(var i = 0; i < w.rules_url.length; i++)
	{
		var regex = new RegExp(w.rules_url[i].url, "i");
		if(regex.test(download.url))
		{
			path = w.rules_url[i].dir;
			break;
		}
	}
	
	// else check for file type only rules:
	if(path === "") for(var i = 0; i < w.rules_ext.length; i++)
	{
		if(w.rules_ext[i].ext.indexOf(filetype) !== -1)
		{
			path = w.rules_ext[i].dir;
			break;
		}
	}
	
	// if no rule matched, take default path:
	if(path === "") path = w.defaultPath;
	
	// check if path contains variables and substitute them with appropriate values:
	path = path.replace(/%DOMAIN%/gi, download.url.split("?")[0].split("/")[2]); // 2 because of "//" behind protocol
	path = path.replace(/%FILETYPE%/gi, filetype);
	
	suggest({ filename: path+download.filename, conflictAction: w.conflictAction });

	console.log("Determined path for ", download);
	console.log("Saving at ", path);
});

chrome.downloads.onChanged.addListener( function(change){
	/*if(change.filename){ // check for manual change of download location:
		console.log("now: "+change.filename.current);
		console.log("path: "+path);
		if(change.filename.current.indexOf(path) === -1) console.log("location manually changed");
		else console.log("location unchanged");
	}*/
	return;
	
	
	if(!change.state) return;
	else if(change.state.current !== "complete") return;
	
	chrome.downloads.open(change.id);
	window.setTimeout( function(){ deleteFile(change.id); }, 5000);
});

function deleteFile(change_id){
	chrome.downloads.search({id: change_id}, function(downloads){
		if(!downloads[0].exists)
		{
			chrome.downloads.erase({ id: downloads[0].id });
			console.log("deleted");
		}
		else
		{
			chrome.downloads.removeFile(downloads[0].id);
			window.setTimeout( function(){ deleteFile(downloads[0].id); }, 5000);
			console.log("still open");
		}
	});
}

// omnibox keyword "download" to download entered file:
chrome.omnibox.onInputEntered.addListener(function(file){
	if(file.indexOf("://") === -1) file = "http://"+file;
	download(file);
});

// contextmenu entry:
chrome.contextMenus.create({ "id" : "downloadcontrol", "contexts" : ["link"], "title" : "Download" }); //chrome.i18n.getMessage("contextmenu_"+s) });
chrome.contextMenus.onClicked.addListener(function(e){ download(e.linkUrl); });

function download(file){
	chrome.downloads.download({ "url" : file }, function(downloadid){
		if (downloadid !== undefined)	console.log("Downloading ", file);
		else							console.log(file, " is an invalid URL - downloading impossible");
	});
}