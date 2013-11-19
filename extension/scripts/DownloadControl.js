(function(){ // debugging

chrome.extension.onMessage.addListener( function(request){ if(request.data === "alert") console.log(request.test); });

}());