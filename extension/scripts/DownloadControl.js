"use strict";

//retrieve and store settings (filled with default values):
var w = {
	"conflictAction"		:	(!localStorage["conflictAction"] 		? "prompt"			: JSON.parse(localStorage["conflictAction"])),
	"removeFromListWhen"	:	(!localStorage["removeFromListWhen"]	? "fileDeleted"		: JSON.parse(localStorage["removeFromListWhen"])),
	"contextMenu"			:	(!localStorage["contextMenu"	] 		? { "open" : "1" }	: JSON.parse(localStorage["contextMenu"])),
	"defaultPathBrowser"	:	(!localStorage["defaultPathBrowser"] 	? ""				: JSON.parse(localStorage["defaultPathBrowser"])),
	"defaultPathAppendix"	:	(!localStorage["defaultPathAppendix"] 	? ""				: JSON.parse(localStorage["defaultPathAppendix"])),
	"rules_both" 			:	(!localStorage["rules_both"]			? [] 				: JSON.parse(localStorage["rules_both"])),
	"rules_url" 			:	(!localStorage["rules_url"]				? [] 				: JSON.parse(localStorage["rules_url"])),
	"rules_ext" 			:	(!localStorage["rules_ext"]				? [] 				: JSON.parse(localStorage["rules_ext"])),
	"suggestedRules" 		:	(!localStorage["suggestedRules"]		? [] 				: JSON.parse(localStorage["suggestedRules"])),
	"preventClosing"		:	(!localStorage["preventClosing"]		? "1" 				: JSON.parse(localStorage["preventClosing"])),
	"notifyDone"			:	(!localStorage["notifyDone"]			? "1" 				: JSON.parse(localStorage["notifyDone"])),
	"notifyFail"			:	(!localStorage["notifyFail"]			? "1" 				: JSON.parse(localStorage["notifyFail"]))
};

adjustContextMenu(); // contextmenu entries

chrome.downloads.onDeterminingFilename.addListener( onDeterminingFilename );
chrome.downloads.onChanged.addListener( onChanged );

function onDeterminingFilename(download, suggest){
	determineFolder(download, suggest);
	if(!download.byExtensionId || download.filename.indexOf("DownloadControl.check") === -1) preventBrowserClosing(); // default folder check
}
function onChanged(change){
	openFile( change );
	checkIfSavedInExpectedFolder( change );
	notifyDownloadState( change );
	removeBrowserClosingPrevention( change );
	removeDownloadFromList( change );
}

// determine correct location:
function determineFolder(download, suggest){
	if(download.byExtensionId === chrome.i18n.getMessage("@@extension_id") && download.filename.indexOf("DownloadControl.check") !== -1) return; // default folder check

	var path = "";
	var filetype = download.filename.substring(download.filename.lastIndexOf(".")+1);
	var matched = false;

	// check for matching rules with URL and file type first:
	for(var i = 0; i < w.rules_both.length; i++)
	{
		var regex = new RegExp(w.rules_both[i].url, "i"); // i = matches lower- & uppercase
		if(regex.test(download.url) && w.rules_both[i].ext.indexOf(filetype) !== -1)
		{
			path = w.rules_both[i].dir;
			matched = true;
			break;
		}
	}
	
	// if no rules matched, check for URL only:
	if(!matched) for(var i = 0; i < w.rules_url.length; i++)
	{
		var regex = new RegExp(w.rules_url[i].url, "i");
		if(regex.test(download.url))
		{
			path = w.rules_url[i].dir;
			matched = true;
			break;
		}
	}
	
	// else check for file type only rules:
	if(!matched) for(var i = 0; i < w.rules_ext.length; i++)
	{
		if(w.rules_ext[i].ext.indexOf(filetype) !== -1)
		{
			path = w.rules_ext[i].dir;
			matched = true;
			break;
		}
	}
	
	// if no rule matched, take default path:
	if(!matched) path = w.defaultPathAppendix;
	
	// check if path contains variables and substitute them with appropriate values:
	path = path.replace(/%DOMAIN%/gi, download.url.split("?")[0].split("/")[2]); // 2 because of "//" behind protocol
	path = path.replace(/%FILETYPE%/gi, filetype);
	
	w[download.id] = w.defaultPathBrowser+path; // save for comparison with final save path
	suggest({ filename: path+download.filename, conflictAction: w.conflictAction });

	console.log("Determined path for ", download);
	console.log("Suggested ", path);
}

// omnibox:
chrome.omnibox.onInputStarted.addListener( handleOmnibox );
chrome.omnibox.onInputChanged.addListener( handleOmnibox );
chrome.omnibox.onInputEntered.addListener( function (string){
	var s = string.split(" ");
	for(var i = 0; i < s.length; i++) if(s[i] === "") s.splice(i, 1); // remove empty entries

	if(!s[1]) // no keyword -> try to download it:
		save( s[0].indexOf("://") > 0 ? s[0] : "http://"+s[0] );
	else if(s[0] === "o" || s[0] === "open") // open
		open( s[1].indexOf("://") > 0 ? s[1] : "http://"+s[1] );
	else if(s[0] === "s" || s[0] === "search") // search
	{
		//chrome.downloads.search({ });
	}
	else console.log("User entered an invalid command into omnibox");
});
function handleOmnibox(text, suggest){
	console.log(text);
	suggest([
		{ "content" : "open "+text, "description" : "Open "+text},
		{ "content" : "search "+text, "description" : "Search a download containing "+text}
	]);
};

// contextMenu clicks:
chrome.contextMenus.onClicked.addListener( function (e){
	if 		(e.menuItemId === "dc_save") save(e.linkUrl);
	else if (e.menuItemId === "dc_open") open(e.linkUrl);
});

function adjustContextMenu(){
	chrome.contextMenus.removeAll( function(){
		if( w.contextMenu.open === "1" ) chrome.contextMenus.create({ "id" : "dc_open", "contexts" : ["link"], "title" : chrome.i18n.getMessage("open") });
		if( w.contextMenu.save === "1" ) chrome.contextMenus.create({ "id" : "dc_save", "contexts" : ["link"], "title" : chrome.i18n.getMessage("save") });
	});
}

function save(file){
	chrome.downloads.download({ "url" : file }, function (downloadid){
		if (typeof downloadid !== "undefined")	console.log("Saving ", file);
		else									console.error(file, " is an invalid URL - downloading impossible");
	});
}

// mark file to open at completion:
function open(file){
	chrome.downloads.download({ "url" : file }, function (downloadid){
		if (typeof downloadid !== "undefined")
		{
			localStorage[ downloadid ] = "open";
			console.log("Opening ", file);
		}
		else console.error(file, " is an invalid URL - downloading impossible");
	});
}

// open files:
function openFile(change){
	if(!change.state) return;
	else if(change.state.current !== "complete" && change.state.current !== "interrupted") { console.log("Following untreated change of state occured: ", change); return; }
	
	if(typeof localStorage[ change.id.toString() ] === "undefined") return; // stop if file shouldn't get opened
	
	delete localStorage[ change.id.toString() ];	// remove from list of files to get opened
	if(change.state.current !== "complete") return;	// if download got interrupted stop here

	chrome.downloads.open( change.id );
	window.setTimeout( function(){ deleteFile(change.id); }, 5000);
}

function deleteFile(change_id){
	chrome.downloads.search({id: change_id}, function (downloads){
		if(downloads.length === 0) return; // download got removed already

		if(!downloads[0].exists)
		{
			chrome.downloads.erase({ id: downloads[0].id });
			console.log("deleted");
		}
		else
		{
			chrome.downloads.removeFile(downloads[0].id);
			window.setTimeout( function(){ deleteFile(downloads[0].id); }, 10000);
			console.log("still open");
		}
	});
}

// check if file gets saved where Download Control expects it:
function checkIfSavedInExpectedFolder (change){
	if(!change.filename || !w[change.id] || w.defaultPathBrowser.length < 3) return;
	console.log("final folder check: is: ", change.filename.current, "expected:", w[change.id]);
	
	// if folder is different than expected (outside of expected folder OR subfolder thereof):
	if(change.filename.current.indexOf(w[change.id]) !== 0 || w[change.id].length !== change.filename.current.lastIndexOf("\\") + 1)
	{
		// inside default folder:
		if(change.filename.current.indexOf(w.defaultPathBrowser) === 0)
		{
			chrome.downloads.search({ "id" : change.id }, function (ds)
			{
				var d = ds[0];
				var newRule = {
					"dir" : correct_path_format( d.filename.substring(w.defaultPathBrowser.length, d.filename.lastIndexOf("\\")) ),
					"ext" : make_array( d.filename.substring(d.filename.lastIndexOf(".")+1) ),
					"url" : d.url.split("/")[2]
				};
				
				// check if rule got suggested earlier already:
				for(var i = w.suggestedRules.length-1; i >= 0; i--)
				{
					if ( JSON.stringify(newRule) === JSON.stringify(w.suggestedRules[i]) )
					{
						console.log(w.suggestedRules[i], "suggested earlier already");
						return;
					}
				}

				// check if same folder got suggested for another file type from same URL earlier already:
				for(var i = w.suggestedRules.length-1; i >= 0; i--)
				{
					if ( newRule.url === w.suggestedRules[i]["url"] && newRule.dir === w.suggestedRules[i]["dir"] )
					{
						console.log("file type",newRule.ext, "added to", w.suggestedRules[i]);
						w.suggestedRules[i]["ext"].push(newRule.ext);
						save_new_value("suggestedRules", w.suggestedRules, function(){ chrome.runtime.sendMessage({ "update" : "1" }); /* update options page if open */ });
						return;
					}
				}

				// check if another folder got suggested for this file type and URL earlier already:
				for(var i = w.suggestedRules.length-1; i >= 0; i--)
				{
					if ( newRule.url === w.suggestedRules[i]["url"] && w.suggestedRules[i]["ext"].indexOf(newRule.ext) )
					{
						console.log("folder of", w.suggestedRules[i], "updated into", newRule.dir);
						w.suggestedRules[i]["dir"] = newRule.dir;
						save_new_value("suggestedRules", w.suggestedRules, function(){ chrome.runtime.sendMessage({ "update" : "1" }); /* update options page if open */ });
						return;
					}
				}

				w.suggestedRules[w.suggestedRules.length] = newRule;
				save_new_value("suggestedRules", w.suggestedRules, function(){ chrome.runtime.sendMessage({ "update" : "1" }); /* update options page if open */ });
				
				if(chrome.notifications) chrome.notifications.create(
					"newRule",
					{
						"type" : "basic",
						"iconUrl" : "images/96.png",
						"title" : "New rule suggested",
						"message" : "Click this notification to review it now"
					},
					function (id){}
				);	

				console.log("location changed inside default folder -> suggesting new rule", w.suggestedRules[w.suggestedRules.length-1], "for", d);
			});
		}
		else 	console.log("location changed to outside of default folder -> can't handle");
	}
	else 		console.log("location unchanged");
	
	delete w[change.id]; //clean up
}

// show initial setup page after setup:
chrome.runtime.onInstalled.addListener(function (e){
	if(e.reason === "install") chrome.tabs.create({ url : "options/options.html" });
});

// keyboard shortcuts:
chrome.commands.onCommand.addListener(function (e){
	if(e === "open") 	{}//open("");
	else				{}//save("");
});

// notification handling:
if(chrome.notifications) chrome.notifications.onClicked.addListener( function (id){
	if 		(id === "newRule") 					chrome.tabs.create({ url : "options/options.html" });
	else if (id.split("_")[0] === "completed") 	chrome.downloads.open( parseInt(id.split("_")[1]) );
	else 										chrome.tabs.create("opera://downloads");
});

// helper functions:
function save_new_value(key, value, callback)
{
	key = key.split("."); // split tree
	
	// save to storage cache (w):
	var saveobjectBranch = w;
	for(var i = 0; i < key.length-1; i++){ saveobjectBranch = saveobjectBranch[ key[i] ]; }
	saveobjectBranch[ key[key.length-1] ] = value;
	
	// save in localStorage:
	localStorage[ key[0] ] = JSON.stringify( w[ key[0] ] );

	if( key[0] === "contextMenu" ) adjustContextMenu(); // update contextMenu if necessary

	console.log("Saved", key, value, "settings now: ", w);

	if(typeof callback === "function") callback();
}

function correct_path_format(p, type)
{
	if(p === "") return (type === "absolute" ? false : p);

	p = p.replace(/\//gi, "\\");			// convert forward slashes into back slashes
	if(p[0] === "\\") p = p.substring(1);	// no slash at beginning
	if(p[p.length-1] !== "\\") p += "\\";	// slash at end
	
	if( (p[1] === ":" && type === "relative") || (p[1] !== ":" && type === "absolute") || (p[0] === "." && p[1] === ".") ){
		if 		(p[1] === ":" && type === "relative")	alert( chrome.i18n.getMessage("pathAbsoluteError") );
		else if (p[1] !== ":" && type === "absolute")	alert( chrome.i18n.getMessage("pathRelativeError") );
		else 											alert( chrome.i18n.getMessage("pathOutsideError") );

		return false;
	}
	else return p;
}

function make_array(ext_string, may_be_empty)
{
	ext_string = ext_string.split(" ").join(""); // remove all blanks
	ext_string = ext_string.split(".").join(""); // remove all dots
	
	var ext_array = ext_string.toLowerCase().split(",");
	for(var i = ext_array.length-1; i >= 0; i--) if(ext_array[i] === "") ext_array.splice(i, 1);

	return ( (ext_array.length > 0 || may_be_empty) ? ext_array : false );
}

// prevent browser from closing while there are downloads in progress by opening a non-closable tab:
function preventBrowserClosing(){
	if( w.preventClosing !== "1" ) return;

	chrome.tabs.query({"url":"chrome-extension://*/windowClosingPrevention/windowClosingPrevention.html"}, function(tabs){
		if( tabs.length === 0 ) chrome.tabs.create({
			url : "windowClosingPrevention/windowClosingPrevention.html",
			active: false
		}, function (tab){});
	});
}

// remove tab if no download is active anymore:
function removeBrowserClosingPrevention(change){
	if(!change.state || w.preventClosing !== "1") return;
	chrome.downloads.search({ state : "in_progress" }, function (results){
		if( results.length > 0 ) return;

		chrome.runtime.sendMessage({ "data" : "allDownloadsFinished" });
	});
}

// remove downloads from Downloads history:
function removeDownloadFromList(change){
	if( w.removeFromListWhen === "finished" && change.state)
		if( change.state.current === "complete" ){
			if(typeof localStorage[ change.id.toString() ] !== "undefined") return; // don't remove just yet if file is supposed to get opened by extension
			chrome.downloads.erase({"state" : "complete"});
		}
	else if( w.removeFromListWhen === "fileDeleted" && change.exists) chrome.downloads.erase({"exists" : false});
}

// show desktop notification of download completion or stop
function notifyDownloadState(change){
	if( !change.state ) return;
	// only if download is complete or interrupted and according notification option is turned on
	else if( ( change.state.current === "complete" && w.notifyDone === "1" ) || ( change.state.current === "interrupted" && w.notifyFail === "1" && change.error.current.indexOf("USER") !== 0 ) )
		chrome.downloads.search({"id": change.id}, function(ds){
			var filename = ds[0].filename.substring(ds[0].filename.lastIndexOf("\\") + 1);
			if( ds[0].state === "complete") chrome.notifications.create(
				"completed_"+ds[0].id, // use download's ID as notification ID
				{
					type : "basic",
					iconUrl : "images/128.png",
					title : chrome.i18n.getMessage("download_completed"),
					message : chrome.i18n.getMessage("click_to_open", filename)
				},
				function (id){ /* creation callback */ }
				);
			else chrome.notifications.create(
				"interrupted_"+ds[0].id,
				{
					type : "basic",
					iconUrl : "images/128.png",
					title : chrome.i18n.getMessage("download_interrupted"),
					message : chrome.i18n.getMessage("interrupted_body", filename)
				},
				function (id){ /* creation callback */ }
				);
		});
}