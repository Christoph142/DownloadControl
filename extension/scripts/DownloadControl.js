"use strict";

adjustContextMenu(); // contextmenu entries

chrome.downloads.onDeterminingFilename.addListener( onDeterminingFilename );
chrome.downloads.onCreated.addListener( onCreated );
chrome.downloads.onChanged.addListener( onChanged );
chrome.downloads.onErased.addListener( onErased );
chrome.alarms.onAlarm.addListener( onAlarm );

async function onDeterminingFilename(download, suggest){
	await determineFolder(download, suggest);
	if(!download.byExtensionId || download.filename.indexOf("DownloadControl.check") === -1) preventBrowserClosing(); // default folder check
}

async function onCreated(download) {
	const p = await getPrefs();
	if (!p.notifyProgress === "1") return;
	if (download.state === "interrupted" || download.state === "complete") return; // TODO different notification?
	
	console.log("onCreated: ", download);
	chrome.notifications.create(
		"inprogress_"+download.id, // use download's ID as notification ID
		{
			type : "progress",
			iconUrl : chrome.runtime.getURL("images/128.png"),
			title : chrome.i18n.getMessage("downloading"),
			message : chrome.i18n.getMessage("progress_body", new Date(download.estimatedEndTime)),
			buttons : [{ title : "❚❚" }, { title : "⬛" }]
		},
		function (notificationId){console.log("notifications create callback", notificationId);
			chrome.downloads.getFileIcon(download.id, {size : 32}, function (fileicon){
				createNotificationIcon(fileicon, function(notificationIcon){
					chrome.notifications.update(
						"inprogress_"+download.id,
						{
							iconUrl : notificationIcon,
						},
						function(){ updateProgress( download.id ); }
					);
				});
			});
		}
	);
}

async function onChanged(change){
	console.log("onChanged: ", change);
	if (change.state) onStateChanged(change);
	else if (change.filename) onFilenameChanged(change);
	else if (change.paused) onPausedChanged(change);
}

async function onStateChanged(change){
	openFile( change );
	notifyDownloadState( change );
	removeBrowserClosingPrevention( change );
	removeDownloadFromList( change );
}

async function onFilenameChanged(change){
	checkIfSavedInExpectedFolder( change );
}

async function onPausedChanged(change){
	chrome.notifications.update("inprogress_"+change.id, {
		buttons : [{ title : change.paused.current ? "►" : "❚❚" }, { title : chrome.i18n.getMessage("cancel") }]
	}, function(){ if (!change.paused.current) updateProgress(change.id); });
}

async function onErased(id){
	console.debug("onErased: ", id);
	chrome.notifications.clear("inprogress_"+id);
	chrome.notifications.clear("completed_"+id);
	chrome.notifications.clear("interrupted_"+id);
}

// determine correct location:
async function determineFolder(download, suggest){
	if(download.byExtensionId === chrome.i18n.getMessage("@@extension_id") && download.filename.indexOf("DownloadControl.check") !== -1) return; // default folder check

	const p = await getPrefs();

	const filetype = download.filename.substring(download.filename.lastIndexOf(".")+1);
	let path = "";
	let matched = false;

	// check for matching rules with URL and file type first:
	for(let i = 0; i < p.rules_both.length; i++)
	{
		const regex = new RegExp(p.rules_both[i].url, "i"); // i = matches lower- & uppercase
		if(regex.test(download.url) && p.rules_both[i].ext.indexOf(filetype) !== -1)
		{
			path = p.rules_both[i].dir;
			matched = true;
			break;
		}
	}
	
	// if no rules matched, check for URL only:
	if(!matched) for(let i = 0; i < p.rules_url.length; i++)
	{
		const regex = new RegExp(p.rules_url[i].url, "i");
		if(regex.test(download.url))
		{
			path = p.rules_url[i].dir;
			matched = true;
			break;
		}
	}
	
	// else check for file type only rules:
	if(!matched) for(let i = 0; i < p.rules_ext.length; i++)
	{
		if(p.rules_ext[i].ext.indexOf(filetype) !== -1)
		{
			path = p.rules_ext[i].dir;
			matched = true;
			break;
		}
	}
	
	// if no rule matched, take default path:
	if(!matched) path = p.defaultPathAppendix;
	
	// check if path contains variables and substitute them with appropriate values:
	path = path.replace(/%DOMAIN%/gi, download.url.split("?")[0].split("/")[2]); // 2 because of "//" behind protocol
	path = path.replace(/%FILETYPE%/gi, filetype);
	
	p[download.id] = p.defaultPathBrowser+path; // save for comparison with final save path
	suggest({ filename: path+download.filename, conflictAction: p.conflictAction });

	console.log("Determined path for ", download);
	console.log("Suggested ", path);
}

// omnibox:
chrome.omnibox.onInputStarted.addListener( omnibox_suggest );
chrome.omnibox.onInputChanged.addListener( omnibox_suggest );
chrome.omnibox.onInputEntered.addListener( omnibox_handle );

function omnibox_suggest(text, suggest){
	suggest([
		{ "content" : "open "+text, "description" : "Open "+text},
		{ "content" : "save "+text, "description" : "Save "+text}
	]);
}

function omnibox_handle(string){
	const s = string.split(" ");
	for(let i = 0; i < s.length; i++) if(s[i] === "") s.splice(i, 1); // remove empty entries

	if(!s[1] || s[0] === "s" || s[0] === "save")	save( s[0].indexOf("://") > 0 ? s[0] : "http://"+s[0] ); // no keyword / download entry
	else if(s[0] === "o" || s[0] === "open")		open( s[1].indexOf("://") > 0 ? s[1] : "http://"+s[1] ); // open
	else 											console.log("User entered an invalid command into omnibox");
}

// contextMenu clicks:
chrome.contextMenus.onClicked.addListener( function (e){
	if 		(e.menuItemId === "dc_save") save(e.linkUrl);
	else if (e.menuItemId === "dc_open") open(e.linkUrl);
});

async function adjustContextMenu(){
	const p = await getPrefs();
	chrome.contextMenus.removeAll( function(){
		if( p.contextMenu.open === "1" ) chrome.contextMenus.create({ "id" : "dc_open", "contexts" : ["link"], "title" : chrome.i18n.getMessage("open") });
		if( p.contextMenu.save === "1" ) chrome.contextMenus.create({ "id" : "dc_save", "contexts" : ["link"], "title" : chrome.i18n.getMessage("save") });
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
			chrome.storage.local.set({ downloadid: "open" });
			console.log("Opening ", file);
		}
		else console.error(file, " is an invalid URL - downloading impossible");
	});
}

// open files:
async function openFile(change){
	if(!change.state) return;
	else if(change.state.current !== "complete" && change.state.current !== "interrupted") { console.log("Following untreated change of state occured: ", change); return; }
	
	const download = await chrome.storage.local.get( change.id.toString() );
	if(!download) return; // stop if file shouldn't get opened
	
	chrome.storage.local.remove( change.id.toString() ); // remove from list of files to get opened
	if(change.state.current !== "complete") return;	// if download got interrupted stop here

	chrome.downloads.open( change.id );
	chrome.alarms.create( "deleteFile "+change.id, { when: Date.now() + 5000 });
}

async function deleteFile(change_id){
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
			chrome.alarms.create( "deleteFile "+downloads[0].id, { when: Date.now() + 10000 });
			console.log("still open");
		}
	});
}

// check if file gets saved where Download Control expects it:
async function checkIfSavedInExpectedFolder (change){
	const p = await getPrefs();
	if(!p[change.id] || p.defaultPathBrowser.length < 3) return;
	console.log("final folder check: is: ", change.filename.current, "expected:", p[change.id]);
	
	// if folder is different than expected (outside of expected folder OR subfolder thereof):
	if(change.filename.current.indexOf(p[change.id]) !== 0 || p[change.id].length !== change.filename.current.lastIndexOf("\\") + 1)
	{
		// inside default folder:
		if(change.filename.current.indexOf(p.defaultPathBrowser) === 0)
		{
			chrome.downloads.search({ "id" : change.id }, function (ds)
			{
				const d = ds[0];
				const newRule = {
					"dir" : correct_path_format( d.filename.substring(p.defaultPathBrowser.length, d.filename.lastIndexOf("\\")) ),
					"ext" : make_array( d.filename.substring(d.filename.lastIndexOf(".")+1) ),
					"url" : d.url.split("/")[2]
				};
				
				// check if rule got suggested earlier already:
				for(let i = p.suggestedRules.length-1; i >= 0; i--)
				{
					if ( JSON.stringify(newRule) === JSON.stringify(p.suggestedRules[i]) )
					{
						console.log(p.suggestedRules[i], "suggested earlier already");
						return;
					}
				}

				// check if same folder got suggested for another file type from same URL earlier already:
				for(let i = p.suggestedRules.length-1; i >= 0; i--)
				{
					if ( newRule.url === p.suggestedRules[i]["url"] && newRule.dir === p.suggestedRules[i]["dir"] )
					{
						console.log("file type",newRule.ext, "added to", p.suggestedRules[i]);
						p.suggestedRules[i]["ext"].push(newRule.ext);
						save_new_value("suggestedRules", p.suggestedRules, function(){ chrome.runtime.sendMessage({ "update" : "1" }); /* update options page if open */ });
						return;
					}
				}

				// check if another folder got suggested for this file type and URL earlier already:
				for(let i = p.suggestedRules.length-1; i >= 0; i--)
				{
					if ( newRule.url === p.suggestedRules[i]["url"] && p.suggestedRules[i]["ext"].indexOf(newRule.ext) )
					{
						console.log("folder of", p.suggestedRules[i], "updated into", newRule.dir);
						p.suggestedRules[i]["dir"] = newRule.dir;
						save_new_value("suggestedRules", p.suggestedRules, function(){ chrome.runtime.sendMessage({ "update" : "1" }); /* update options page if open */ });
						return;
					}
				}

				p.suggestedRules[p.suggestedRules.length] = newRule;
				save_new_value("suggestedRules", p.suggestedRules, function(){ chrome.runtime.sendMessage({ "update" : "1" }); /* update options page if open */ });
				
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

				console.log("location changed inside default folder -> suggesting new rule", p.suggestedRules[p.suggestedRules.length-1], "for", d);
			});
		}
		else 	console.log("location changed to outside of default folder -> can't handle");
	}
	else 		console.log("location unchanged");
	
	delete p[change.id]; //clean up
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
if(chrome.notifications) {
	chrome.notifications.onClicked.addListener( function (id) {
		if 		(id === "newRule") 					chrome.tabs.create({ url : "options/options.html" });
		else if (id.split("_")[0] === "completed") 	chrome.downloads.open( parseInt(id.split("_")[1]) );
		else 										chrome.tabs.create("vivaldi://downloads");
	});
	chrome.notifications.onButtonClicked.addListener(function (id, buttonIndex) {
		if (id.split("_")[0] === "inprogress") {
			if (buttonIndex === 0)	chrome.downloads.pause( parseInt(id.split("_")[1]) );
			else					chrome.downloads.cancel( parseInt(id.split("_")[1]) );
		}
		else if (id.split("_")[0] === "completed") {
			if (buttonIndex === 0)	chrome.downloads.open( parseInt(id.split("_")[1]) );
			else					chrome.downloads.show( parseInt(id.split("_")[1]) );
		}
	});
}

// helper functions:
async function save_new_value(key, value, callback)
{
	const p = await getPrefs();

	key = key.split("."); // split tree

	let saveobjectBranch = p;
	for(let i = 0; i < key.length-1; i++){ saveobjectBranch = saveobjectBranch[ key[i] ]; }
	saveobjectBranch[ key[key.length-1] ] = value;
	
	if( key[0] === "suggestedRules" ) value.sort(function(a, b) { return a.url.localeCompare(b.url); }); // sort alphabetically
	const t = key[0];
	chrome.storage.sync.set({ t : JSON.stringify( p[ key[0] ] ) });

	if( key[0] === "contextMenu" ) adjustContextMenu(); // update contextMenu if necessary

	console.log("Saved", key, value, "settings now: ", p);

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
	
	const ext_array = ext_string.toLowerCase().split(",");
	for(let i = ext_array.length-1; i >= 0; i--) if(ext_array[i] === "") ext_array.splice(i, 1);

	return ( (ext_array.length > 0 || may_be_empty) ? ext_array : false );
}

// prevent browser from closing while there are downloads in progress by opening a non-closable tab:
function preventBrowserClosing(){
	if( p.preventClosing !== "1" ) return;

	chrome.tabs.query({"url":"chrome-extension://*/windowClosingPrevention/windowClosingPrevention.html"}, function(tabs){
		if( tabs.length === 0 ) chrome.tabs.create({
			url : "windowClosingPrevention/windowClosingPrevention.html",
			active: false
		}, function (tab){});
	});
}

// remove tab if no download is active anymore:
async function removeBrowserClosingPrevention(change){
	const p = await getPrefs();
	if(!change.state || p.preventClosing !== "1") return;
	chrome.downloads.search({ state : "in_progress" }, function (results){
		if( results.length > 0 ) return;

		chrome.runtime.sendMessage({ "data" : "allDownloadsFinished" });
	});
}

// remove downloads from Downloads history:
async function removeDownloadFromList(change){
	const p = await getPrefs();

	if( p.removeFromListWhen === "finished" && change.state)
		if( change.state.current === "complete" ){
			const download = await chrome.storage.local.get( change.id.toString() );
			if(download) return; // don't remove just yet if file is supposed to get opened by extension
			chrome.downloads.erase({"state" : "complete"});
		}
	else if( p.removeFromListWhen === "fileDeleted" && change.exists) chrome.downloads.erase({"exists" : false});
}

// show desktop notification of download completion or stop
async function notifyDownloadState(change){
	if( !change.state ) return;

	const p = await getPrefs();
	if( ( change.state.current === "complete" && p.notifyDone === "1" ) ||
		( change.state.current === "interrupted" && p.notifyFail === "1" && change.error.current.indexOf("USER") !== 0 ) )
		chrome.downloads.search({"id": change.id}, function(ds){
			const filename = ds[0].filename.substring(ds[0].filename.lastIndexOf("\\") + 1);
			if( ds[0].state === "complete") chrome.downloads.getFileIcon(ds[0].id, {size : 32}, function (fileicon){
				createNotificationIcon(fileicon, function(notificationIcon){
					chrome.notifications.create(
						"completed_"+ds[0].id, // use download's ID as notification ID
						{
							type : "basic",
							iconUrl : notificationIcon,
							title : chrome.i18n.getMessage("download_completed"),
							message : chrome.i18n.getMessage("click_to_open", filename),
							buttons : [{ title : chrome.i18n.getMessage("open") }, { title : chrome.i18n.getMessage("show") }]
						},
						function (id){ /* creation callback */ }
					);
				});
			});
			else chrome.downloads.getFileIcon(ds[0].id, {size : 32}, function (fileicon){
				createNotificationIcon(fileicon, function(notificationIcon){
					chrome.notifications.create(
						"interrupted_"+ds[0].id,
						{
							type : "basic",
							iconUrl : notificationIcon,
							title : chrome.i18n.getMessage("download_interrupted"),
							message : chrome.i18n.getMessage("interrupted_body", filename)
						},
						function (id){ /* creation callback */ }
					);
				});
			});
		});
}

async function updateProgress( id ) {
	const df = new Intl.RelativeTimeFormat("en");
	chrome.downloads.search({"id": id}, function(ds){
		if( ds[0] === undefined || ds[0].state !== "in_progress") return;
		const minutesRemaining = Math.round((new Date(ds[0].estimatedEndTime)- new Date())/1000/60);
		chrome.notifications.update(
			"inprogress_"+id,
			{
				progress : ds[0].totalBytes > 0 ? Math.round(100 * ds[0].bytesReceived / ds[0].totalBytes) : 100,
				title : ds[0].paused ? "Download paused" : "Downloading...",
				message : ds[0].estimatedEndTime ? df.format(minutesRemaining, "minute") : ""
			},
			function (wasUpdated){
				if (!ds[0].paused) chrome.alarms.create( "updateProgress "+id, { when: Date.now() + 500 });
			}
		);
	});
}

async function createNotificationIcon(fileIconString, callback){
    // Create an empty canvas element
    const canvas = new OffscreenCanvas(256, 256);

    // Copy images into canvas
    let loaded = 0;
    const fileIconData = await fetch(fileIconString);
    const fileIconBlob = await fileIconData.blob();
	const fileIcon = createImageBitmap(fileIconBlob);

	//const extensionIconData = await fetch("images/64.png");
    //const extensionIconBlob = await extensionIconData.blob();
	//const extensionIcon = await createImageBitmap(extensionIconBlob);

	//const extensionIconBlob = new FileReader().readAsDataURL("images/64.png");
	//const extensionIcon = await createImageBitmap(blob);
	
	const ctx = canvas.getContext("2d");

	Promise.all([fileIcon/*, extensionIcon*/]).then(icons => finishIcon(icons));

	async function finishIcon(icons){
		const fileIcon = icons[0];
		//const extensionIcon = icons[1];
		ctx.drawImage(fileIcon, 32, 32, 176, 176);
	    //ctx.drawImage(extensionIcon, 160, 160);

	    if(typeof callback === "function") {
	    	const blob = await canvas.convertToBlob();
	    	const base64 = await blobToBase64(blob);
	    	callback(base64);
	    }
	}
}

function blobToBase64(blob) {
  return new Promise((resolve, _) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(blob);
  });
}

async function getPrefs() {
	return new Promise((resolve, reject) =>
	chrome.storage.sync.get({// default settings:
		conflictAction		:	"prompt",
		removeFromListWhen	:	"fileDeleted",
		contextMenu			:	{ "open" : "1" },
		defaultPathBrowser	:	"",
		defaultPathAppendix	:	"",
		rules_both 			:	[],
		rules_url 			:	[],
		rules_ext 			:	[],
		suggestedRules 		:	[],
		preventClosing		:	"1",
		notifyProgress		:	"1",
		notifyDone			:	"1",
		notifyFail			:	"1"
		}, storage => resolve(storage)
	));
}

async function onAlarm(alarm) {
	const action = alarm.name.split(" ");
	if (action[0] === "deleteFile") deleteFile(parseInt(action[1]));
	else if (action[0] === "updateProgress") updateProgress(parseInt(action[1]));
	else console.warn("unknown alarm", alarm);
}
