window.onbeforeunload = function(){ return chrome.i18n.getMessage("downloadInProgress"); }

chrome.runtime.onMessage.addListener( function(request, sender, sendResponse){
	if(request.data !== "allDownloadsFinished") return;

	window.onbeforeunload = null;
	window.close();
});