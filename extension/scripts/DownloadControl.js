"use strict";

//retrieve and store settings (filled with default values):
var w = {};
chrome.storage.sync.get( null, function (storage){
	w = {
	"conflictAction"		:	(!storage["conflictAction"] 		? "prompt"			: storage["conflictAction"]),
	"contextMenu"			:	(!storage["contextMenu"	] 			? { "open" : "1" }	: storage["contextMenu"	]),
	"defaultPathBrowser"	:	(!storage["defaultPathBrowser"] 	? ""				: storage["defaultPathBrowser"]),
	"defaultPathAppendix"	:	(!storage["defaultPathAppendix"] 	? ""				: storage["defaultPathAppendix"]),
	"rules_both" 			:	(!storage["rules_both"]				? [] 				: storage["rules_both"]),
	"rules_url" 			:	(!storage["rules_url"]				? [] 				: storage["rules_url"]),
	"rules_ext" 			:	(!storage["rules_ext"]				? [] 				: storage["rules_ext"]),
	"suggestedRules" 		:	(!storage["suggestedRules"]			? [] 				: storage["suggestedRules"])
	};

	adjustContextMenu(); // contextmenu entries
});

// determine correct location:
chrome.downloads.onDeterminingFilename.addListener( function (download, suggest){
	if(download.byExtensionId === "iccnbnkbhccimhmjoehjcbipkiogdfbc" && download.filename.indexOf("DownloadControl.check") !== -1) return; // default folder check

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
	if(path === "") path = w.defaultPathAppendix;
	
	// check if path contains variables and substitute them with appropriate values:
	path = path.replace(/%DOMAIN%/gi, download.url.split("?")[0].split("/")[2]); // 2 because of "//" behind protocol
	path = path.replace(/%FILETYPE%/gi, filetype);
	
	w[download.id] = w.defaultPathBrowser+path; // save for comparison with final save path
	suggest({ filename: path+download.filename, conflictAction: w.conflictAction });

	console.log("Determined path for ", download);
	console.log("Suggested ", path);
});

// omnibox keyword "download" to download entered file:
chrome.omnibox.onInputEntered.addListener( function (file){
	if(file.indexOf("://") === -1) file = "http://"+file;
	save(file);
});

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
		if (downloadid !== undefined)	console.log("Saving ", file);
		else							console.error(file, " is an invalid URL - downloading impossible");
	});
}

// mark file to open at completion:
function open(file){
	chrome.downloads.download({ "url" : file }, function (downloadid){
		if (downloadid !== undefined)
		{
			var saveobject = {};
			saveobject[ downloadid ] = "open";
			chrome.storage.local.set(saveobject);

			console.log("Opening ", file);
		}
		else console.error(file, " is an invalid URL - downloading impossible");
	});
}

// open files:
chrome.downloads.onChanged.addListener( function (change){
	if(!change.state) return;
	else if(change.state.current !== "complete" && change.state.current !== "interrupted") { console.log("Following untreated change of state occured: ", change); return; }
	
	chrome.storage.local.get( change.id.toString(), function (l){
		if(l[ change.id.toString() ] === undefined) return;		// stop if file shouldn't get opened
		
		chrome.storage.local.remove( change.id.toString() );	// remove from list of file to get opened
		if(change.state.current !== "complete") return;			// if download got interrupted stop here

		chrome.downloads.open( change.id );
		window.setTimeout( function(){ deleteFile(change.id); }, 5000);
	});
});

function deleteFile(change_id){
	chrome.downloads.search({id: change_id}, function (downloads){
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
chrome.downloads.onChanged.addListener( function (change){
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
				var jsonRule = JSON.stringify(newRule);
				
				// check if rule got suggested earlier already:
				for(var i = w.suggestedRules.length-1; i >= 0; i--)
				{
					if ( jsonRule === JSON.stringify(w.suggestedRules[i]) )
					{
						console.log("location changed inside default folder -> rule", w.suggestedRules[w.suggestedRules.length-1], "suggested earlier already");
						return;
					}
				}

				w.suggestedRules[w.suggestedRules.length] = newRule;
				save_new_value("suggestedRules", w.suggestedRules, function(){ chrome.extension.sendMessage({ "update" : "1" }); /* update options page if open */ });
				
				console.log("location changed inside default folder -> suggesting new rule", w.suggestedRules[w.suggestedRules.length-1], "for", d);
			});
		}
		else 	console.log("location changed to outside of default folder -> can't handle");
	}
	else 		console.log("location unchanged");
	
	delete w[change.id]; //clean up
});

// show initial setup page after setup:
chrome.runtime.onInstalled.addListener(function (e){
	if(e.reason === "install") chrome.tabs.create({ url : "options/options.html" });
});

// keyboard shortcuts:
chrome.commands.onCommand.addListener(function (e){
	if(e === "open") 	{}//open("");
	else				{}//save("");
});


// helper functions:
function save_new_value(key, value, callback)
{
	key = key.split("."); // split tree
	
	// save to sync storage cache (w):
	var saveobjectBranch = w;
	for(var i = 0; i < key.length-1; i++){ saveobjectBranch = saveobjectBranch[ key[i] ]; }
	saveobjectBranch[ key[key.length-1] ] = value;
	
	// save in Chrome's synced storage:
	var saveobject = {};
	saveobject[ key[0] ] = w[ key[0] ];
	chrome.storage.sync.set(saveobject);

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