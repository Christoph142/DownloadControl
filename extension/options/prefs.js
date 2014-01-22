window.addEventListener("DOMContentLoaded", onInstall, false);
window.addEventListener("DOMContentLoaded", restoreprefs, false);
window.addEventListener("DOMContentLoaded", localize, false);
window.addEventListener("DOMContentLoaded", add_page_handling, false);

var bg = chrome.extension.getBackgroundPage();
var storage = bg.w;

window.addEventListener("change", function(e) // save preferences:
{
	if(e.target.id === "url" || e.target.id === "ext" || e.target.id === "dir") return; // saved via "Add"-button
	
	if(e.target.id.indexOf("defaultPath") !== -1){
		if(e.target.id === "defaultPathBrowser")	var p = correct_path_format(e.target.value, "absolute");
		else 										var p = correct_path_format(e.target.value, "relative");

		if(p !== false) 	e.target.value = p;
		else 				return;
	}
	
	if(e.target.type === "checkbox") save_new_value(e.target.id, e.target.checked?"1":"0");
	else if(e.target.type === "radio")
	{
		var radio = document.getElementsByName(e.target.name);
		for(var i = 0; i < radio.length; i++)
		{
			if(radio[i].checked){ save_new_value(radio[i].name, radio[i].value); break; }
		}
	}
	else save_new_value(e.target.id, e.target.value);
},false);

function save_new_value(key, value, callback)
{
	key = key.split("."); // split tree
	
	// save in bg's settings object:
	var saveobjectBranch = bg.w;
	for(var i = 0; i < key.length-1; i++){ saveobjectBranch = saveobjectBranch[ key[i] ]; }
	saveobjectBranch[ key[key.length-1] ] = value;
	
	// save in Chrome's synced storage:
	var saveobject = {};
	saveobject[ key[0] ] = bg.w[ key[0] ];
	chrome.storage.sync.set(saveobject);

	restoreprefs(); // update settings page

	if( key[0] === "contextMenu" ) bg.adjustContextMenu(); // update contextMenu if necessary

	console.log("Saved", key, value, "settings now: ", storage);

	if(typeof callback === "function") callback();
}

function restoreprefs()
{
	// get rules:
	var rule_arrays = ["rules_both", "rules_url", "rules_ext"];
	for(var i in rule_arrays)
	{
		var rules = rule_arrays[i];
		var rules_element = document.getElementById(rules);

		// head:
		var head = "<tr>";
		if(rules !== "rules_ext") head += "<th>"+chrome.i18n.getMessage("website")+"</th>";
		if(rules !== "rules_url") head += "<th>"+chrome.i18n.getMessage("file_types")+"</th>";
		head += "<th>"+chrome.i18n.getMessage("directory")+"</th></tr>";
		rules_element.innerHTML = head;

		// content:
		for(var i = 0; i < storage[rules].length; i++)
		{
			var tr = "<tr class='rule'>";
			if(storage[rules][i].url) tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".url'>"+storage[rules][i].url+"</td>";
			if(storage[rules][i].ext) tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".ext'>"+getFileTypes(storage[rules][i])+"</td>";
			tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".dir'>"+storage[rules][i].dir+"</td>\
				   <td class='delete_rule' data-nr='"+i+"' data-from='"+rules+"'></td></tr>";
			
			rules_element.innerHTML += tr;
		}
		
		if(storage[rules].length === 0) rules_element.innerHTML += "<br><span>No rules yet</span>";
	}

	// delete rule buttons:
	var delete_rule_buttons = document.getElementsByClassName("delete_rule");
	for(var i = 0; i < delete_rule_buttons.length; i++)
	{
		delete_rule_buttons[i].addEventListener("click", function(){
			storage[this.dataset.from].splice([this.dataset.nr], 1);
			save_new_value(this.dataset.from, storage[this.dataset.from]);
		}, false);
	}
	
	// get inputs:
	var inputs = document.getElementsByTagName("input");	
	for(var i = 0; i < inputs.length; i++){
		if( !storage[inputs[i].id] && !storage[inputs[i].name] && inputs[i].id.split(".")[0] !== "contextMenu") continue;
		
		if( inputs[i].type === "checkbox" ){
			if(inputs[i].id.split(".")[0] === "contextMenu") inputs[i].checked = (storage["contextMenu"][ inputs[i].id.split(".")[1] ] === "1" ? true : false);
			else 											 inputs[i].checked = (storage[inputs[i].id] === "0" ? false : true);
		}
		else if ( inputs[i].type === "radio" ){	if( inputs[i].value === storage[inputs[i].name] ) inputs[i].checked = true; }
		else									inputs[i].value = storage[inputs[i].id];
	}
}

function make_array(ext_string){
	ext_string = ext_string.split(" ").join(""); // remove all blanks
	ext_string = ext_string.split(".").join(""); // remove all dots
	
	var ext_array = ext_string.toLowerCase().split(",");
	for(var i = ext_array.length-1; i >= 0; i--) if(ext_array[i] === "") ext_array.splice(i, 1);

	return ext_array;
}
function getFileTypes(rule){
	var ext_string = "";
	for(var i in rule.ext) ext_string += (ext_string === "" ? "" : ", ") + rule.ext[i];
	return ext_string;
}

function add_page_handling()
{
	// change subpages:
	var menu = document.getElementsByClassName("menu");
	for(var i = 0; i < menu.length; i++)
	{
		menu[i].addEventListener("click", function(){
			document.getElementsByClassName("selected")[0].className = "menu i18n";
			this.className = "menu i18n selected";
			document.getElementsByClassName("visible")[0].className = "invisible";
			document.getElementById("content"+this.dataset.target).className = "visible";
		}, false);
	}
	
	// save new rules:
	document.getElementById("add_rule").addEventListener("click", function(){
		if((document.getElementById("url").value === "" && document.getElementById("ext").value === "") || document.getElementById("dir").value === "")
			alert( chrome.i18n.getMessage("incompleteInput") );
		else 
		{
			var dir = correct_path_format(document.getElementById("dir").value, "relative");
			if(dir === false) return;

			if(document.getElementById("ext").value === "")
			{
				storage.rules_url[storage.rules_url.length] = { "url":document.getElementById("url").value, "dir":dir };
				save_new_value("rules_url", storage.rules_url);
			}
			else if(document.getElementById("url").value === "")
			{
				storage.rules_ext[storage.rules_ext.length] = { "ext": make_array(document.getElementById("ext").value), "dir":dir };
				save_new_value("rules_ext", storage.rules_ext);
			}
			else /* url & ext */
			{
				storage.rules_both[storage.rules_both.length] = { "url":document.getElementById("url").value, "ext":make_array(document.getElementById("ext").value), "dir":dir };
				save_new_value("rules_both", storage.rules_both);
			}
		}
	}, false);
	
	// change existing rules/folders:
	document.getElementById("inputchangelistener").addEventListener("input", function(e){
		e.target.addEventListener("blur", handleChanges, false);
	}, false);
	function handleChanges(){ // &nbsp; !!!
		var t = window.event.target;
		var v = t.innerHTML;

		if		(t.dataset.rule.indexOf(".ext") !== -1) v = make_array(t.innerHTML);
		else if (t.dataset.rule.indexOf(".dir") !== -1) v = correct_path_format(t.innerHTML, "relative");
		
		if(v !== false) save_new_value(t.dataset.rule, v);
		t.removeEventListener("blur", handleChanges, false);
	}

	// help:
	document.getElementById("close_help").addEventListener("click", function(e){
		e.preventDefault(); e.stopPropagation();
		document.getElementById("help").style.display = "none";
	}, false);

	// automatical default folder button:
	document.getElementById("checkDefaultPathBrowser").addEventListener("click", function(){
		checkDefaultPathBrowser( function(){
			if(!storage.defaultPathBrowser) document.getElementById("checkDefaultPathBrowser").innerHTML = "Auto-detection failed. Retry?";
			else{
				document.getElementById("defaultPathBrowser").value = storage.defaultPathBrowser;
				document.getElementById("checkDefaultPathBrowser").innerHTML = "Auto-detection successful. Click to refresh if you changed it again";
			}
		});
	});
	
	// prevent shifting of page caused by scrollbars:
	scrollbarHandler.registerCenteredElement(document.getElementById('tool-container'));
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

function localize()
{
	if(chrome.i18n.getMessage("lang") === "ar" || chrome.i18n.getMessage("lang") === "ur_PK") document.body.dir = "rtl";
	
	var strings = document.getElementsByClassName("i18n");
	for(var i = 0; i < strings.length; i++) strings[i].innerHTML = chrome.i18n.getMessage(strings[i].dataset.i18n) + strings[i].innerHTML;
}

// preselect Initial Setup page if not initialized yet:
function onInstall(){
	if(storage.defaultPathBrowser) return;

	var m = document.getElementsByTagName("li");
	m[0].className = "i18n menu selected";
	m[1].className = "i18n menu";

	document.getElementById("content0").className = "visible";
	document.getElementById("content1").className = "invisible";
}

// Determine Chrome/Opera's default download folder:
function checkDefaultPathBrowser(callback){
	chrome.downloads.onChanged.addListener( function (change){
		if(change.filename) if(change.filename.current.indexOf("DownloadControl.check") > 0){

			save_new_value("defaultPathBrowser", change.filename.current.split("DownloadControl")[0], callback);

			// clean up:
			chrome.downloads.cancel(change.id);		// if it's still in progress
			chrome.downloads.removeFile(change.id); // if it already finished
			chrome.downloads.erase({ "id" : change.id });
		}
	});
	alert("If this step opens up a file chooser dialog that prompts you to specify a download location, automatic determination doesn't work right now.\n\
			In this case, cancel the dialog and open your browser's settings again.\n\
			If 'Ask where to save each file before downloading' is active, you may deactivate it and try the auto-detection again. If it isn't or you don't want to try again, manually copy the content of the 'Download location'-field and paste it to this page.\n\n\
			You can repeat this automatic step if you need to see these instructions again.");
	chrome.downloads.download({ "url" : "chrome-extension://iccnbnkbhccimhmjoehjcbipkiogdfbc/options/DownloadControl.check", "conflictAction" : "overwrite" });
}