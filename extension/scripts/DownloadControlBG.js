//retrieve and store settings (filled with default values):
var w = {};
chrome.storage.sync.get( null, function(storage){
	w = {
	"conflictAction":	(!storage["conflictAction"] ? "prompt"	: storage["conflictAction"]),
	"rules_both" 	:	(!storage["rules_both"]		? [] 		: storage["rules_both"]),
	"rules_url" 	:	(!storage["rules_url"]		? [] 		: storage["rules_url"]),
	"rules_ext" 	:	(!storage["rules_ext"]		? [] 		: storage["rules_ext"])
	};
});

chrome.downloads.onDeterminingFilename.addListener( function(download, suggest){ // determine correct location
	
	var path 		= "";
	var filetype 	= download.filename.substring(download.filename.lastIndexOf(".")+1);
	
	// check for matching rules with URL and file type first:
	for(var i = 0; i < w.rules_both.length; i++)
	{
		var regex = new RegExp(w.rules_both[i].url, "i"); // i = matches lower- & uppercase
		if(regex.test(download.url) && filetype === w.rules_both[i].ext)
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
		if(filetype === w.rules_ext[i].ext)
		{
			path = w.rules_ext[i].dir;
			break;
		}
	}
	
	suggest({ filename: path+download.filename, conflictAction: w.conflictAction });
});

chrome.downloads.onChanged.addListener( function(change){
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
			chrome.tabs.query({active: true, currentWindow: true}, function(tabs){ // debugging
				chrome.tabs.sendMessage(tabs[0].id, {data:"alert", test:"deleted"});
			});
		}
		else
		{
			chrome.downloads.removeFile(downloads[0].id);
			window.setTimeout( function(){ deleteFile(downloads[0].id); }, 5000);
			chrome.tabs.query({active: true, currentWindow: true}, function(tabs){ // debugging
				chrome.tabs.sendMessage(tabs[0].id, {data:"alert", test:"still open"});
			});
		}
	});
}
/*	chrome.tabs.query({active: true, currentWindow: true}, function(tabs){ // debugging
		chrome.tabs.sendMessage(tabs[0].id, {data:"alert", test:file});
	});*/