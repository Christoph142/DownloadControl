window.addEventListener("DOMContentLoaded", onInstall, false);
window.addEventListener("DOMContentLoaded", restoreprefs, false);
window.addEventListener("DOMContentLoaded", localize, false);
window.addEventListener("DOMContentLoaded", add_page_handling, false);

var bg = null;
var storage = null;
var ready = false;

chrome.runtime.getBackgroundPage( function (b){
	bg = b;
	storage = b.w;

	if(!ready) ready = true;
	else
	{
		onInstall();
		restoreprefs();
	}
});

window.addEventListener("change", function(e) // save preferences:
{
	if(e.target.id === "url" || e.target.id === "ext" || e.target.id === "dir") return; // saved via "Add"-button
	
	if(e.target.id.indexOf("defaultPath") !== -1){
		if(e.target.id === "defaultPathBrowser")	var p = bg.correct_path_format(e.target.value, "absolute");
		else 										var p = bg.correct_path_format(e.target.value, "relative");

		if(p !== false) 	e.target.value = p;
		else{ 				restoreprefs(); return; }
	}
	
	if(e.target.type === "checkbox") bg.save_new_value(e.target.id, e.target.checked ? "1" : "0");
	else if(e.target.type === "radio")
	{
		var radio = document.getElementsByName(e.target.name);
		for(var i = 0; i < radio.length; i++)
		{
			if(radio[i].checked){ bg.save_new_value(radio[i].name, radio[i].value); break; }
		}
	}
	else bg.save_new_value(e.target.id, e.target.value);
},false);

chrome.runtime.onMessage.addListener( restoreprefs );
function restoreprefs()
{
	if(!ready){ ready = true; return; }

	// get rules:
	var rule_arrays = ["rules_both", "rules_url", "rules_ext", "suggestedRules"];
	for(var i in rule_arrays)
	{
		var rules = rule_arrays[i];
		var rules_element = document.getElementById(rules);

		// head:
		var head = "<tr>";
		if(rules !== "rules_ext") head += "<th>" + chrome.i18n.getMessage("website") + "</th>";
		if(rules !== "rules_url") head += "<th>" + chrome.i18n.getMessage("file_types") + "</th>";
		head += "<th>" + chrome.i18n.getMessage("directory") + "</th></tr>";
		rules_element.innerHTML = head;

		// content:
		for(var i = 0; i < storage[rules].length; i++)
		{
			var tr = "<tr class='rule' draggable='true' data-rule='"+rules+"."+i+"'>";
			if(rules !== "rules_ext") tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".url'>"+storage[rules][i].url+"</td>";
			if(rules !== "rules_url") tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".ext'>"+getFileTypes(storage[rules][i])+"</td>";
			tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".dir'>"+storage[rules][i].dir+"</td>\
				   <td class='delete_rule' data-nr='"+i+"' data-from='"+rules+"'></td>";
			if(rules === "suggestedRules") tr += "<td class='adopt_rule' data-nr='"+i+"'></td>";
			tr += "</tr>";

			rules_element.innerHTML += tr;
		}
		
		if(storage[rules].length === 0) rules_element.innerHTML += "<br><span>" + chrome.i18n.getMessage("no_rules_yet") + "</span>";
	}

	// "delete rule"-buttons:
	var delete_rule_buttons = document.getElementsByClassName("delete_rule");
	for(var i = 0; i < delete_rule_buttons.length; i++)
	{
		delete_rule_buttons[i].addEventListener("click", function(){
			storage[this.dataset.from].splice([this.dataset.nr], 1);
			bg.save_new_value(this.dataset.from, storage[this.dataset.from], restoreprefs);
		}, false);
	}

	// "adopt rule"-buttons:
	var adopt_rule_buttons = document.getElementsByClassName("adopt_rule");
	for(var i = 0; i < adopt_rule_buttons.length; i++)
	{
		adopt_rule_buttons[i].addEventListener("click", function()
		{
			// get by reference:
			var rule = storage.suggestedRules[this.dataset.nr];
			
			if(rule.url === "" && rule.ext.length === 0) alert( chrome.i18n.getMessage("incompleteInput") );
			else
			{
				// get original:
				rule = storage.suggestedRules.splice([this.dataset.nr], 1)[0];

				if(rule.ext.length === 0){
					delete rule.ext;
					storage.rules_url[storage.rules_url.length] = rule;
					bg.save_new_value("rules_url", storage.rules_url);
				}
				else if(rule.url === ""){
					delete rule.url;
					storage.rules_ext[storage.rules_ext.length] = rule;
					bg.save_new_value("rules_ext", storage.rules_ext);
				}
				else{
					storage.rules_both[storage.rules_both.length] = rule;
					bg.save_new_value("rules_both", storage.rules_both);
				}

				bg.save_new_value("suggestedRules", storage.suggestedRules, restoreprefs);
			}
		}, false);
	}
	
	// reorder rules:
	var dragrules = document.getElementsByClassName("rule");
	for(var i = 0; i < dragrules.length; i++){
		dragrules[i].addEventListener("dragstart", dragstart, false);
		dragrules[i].addEventListener("dragover", dragover, false);
		dragrules[i].addEventListener("dragleave", dragleave, false);
		dragrules[i].addEventListener("dragend", dragend, false);
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
		if(document.getElementById("url").value === "" && document.getElementById("ext").value === "") alert( chrome.i18n.getMessage("incompleteInput") );
		else 
		{
			var dir = bg.correct_path_format(document.getElementById("dir").value, "relative");
			if(dir === false) return;

			if(document.getElementById("ext").value === "")
			{
				//#### duplication check
				storage.rules_url[storage.rules_url.length] = { "url" : document.getElementById("url").value, "dir" : dir };
				bg.save_new_value("rules_url", storage.rules_url, restoreprefs);
			}
			else if(document.getElementById("url").value === "")
			{
				//#### duplication check
				storage.rules_ext[storage.rules_ext.length] = { "ext" : bg.make_array(document.getElementById("ext").value), "dir" : dir };
				bg.save_new_value("rules_ext", storage.rules_ext, restoreprefs);
			}
			else /* url & ext */
			{
				//#### duplication check
				storage.rules_both[storage.rules_both.length] = { "url" : document.getElementById("url").value, "ext" : bg.make_array(document.getElementById("ext").value), "dir" : dir };
				bg.save_new_value("rules_both", storage.rules_both, restoreprefs);
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
		
		if		(t.dataset.rule.indexOf(".ext") !== -1) v = bg.make_array(t.innerHTML, ( t.dataset.rule.indexOf("suggestedRules") !== -1 ? true : false) ); // make_array(string, may_be_empty)
		else if (t.dataset.rule.indexOf(".dir") !== -1) v = bg.correct_path_format(t.innerHTML, "relative");
		
		if(v !== false) bg.save_new_value(t.dataset.rule, v, restoreprefs);
		else 			restoreprefs();

		t.removeEventListener("blur", handleChanges, false);
	}

	// help:
	document.getElementById("close_help").addEventListener("click", function(e){
		e.preventDefault(); e.stopPropagation();
		document.getElementById("help").style.display = "none";
	}, false);

	// auto-detect default folder button:
	document.getElementById("checkDefaultPathBrowser").addEventListener("click", function(){
		checkDefaultPathBrowser( function(){
			if(!storage.defaultPathBrowser) document.getElementById("checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("auto_detection_failed");
			else{
				document.getElementById("defaultPathBrowser").value = storage.defaultPathBrowser;
				document.getElementById("checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("auto_detection_succeeded");
			}
		});
	});
	
	// prevent shifting of page caused by scrollbars:
	scrollbarHandler.registerCenteredElement(document.getElementById('tool-container'));
}

function localize()
{
	var strings = document.getElementsByClassName("i18n");
	for(var i = 0; i < strings.length; i++)
	{
		if (strings[i].nodeName === "INPUT") 	strings[i].placeholder = chrome.i18n.getMessage(strings[i].dataset.i18n);
		else 									strings[i].innerHTML = chrome.i18n.getMessage(strings[i].dataset.i18n) + strings[i].innerHTML;
	}
}

// preselect Initial Setup page if not initialized yet:
function onInstall(){
	if(!ready) return;
	if(storage.defaultPathBrowser.length > 2) return;

	var m = document.getElementsByTagName("li");
	m[0].className = "i18n menu selected";
	m[1].className = "i18n menu";

	document.getElementById("content0").className = "visible";
	document.getElementById("content1").className = "invisible";
}

// Determine Chrome/Opera's default download folder:
function checkDefaultPathBrowser(callback){
	chrome.downloads.onChanged.addListener( function (change){
		if(change.filename) if(change.filename.current.indexOf("DownloadControl.check") > 0)
			bg.save_new_value("defaultPathBrowser", change.filename.current.split("DownloadControl")[0], callback);
		if(change.state && storage.checkId) if(change.id === storage.checkId && change.state.current === "complete"){
			// clean up at completion:
			delete storage.checkId;
			chrome.downloads.removeFile(change.id);
			chrome.downloads.erase({ "id" : change.id });
		}
	});
	alert( chrome.i18n.getMessage("auto_detection1") + "\n" + chrome.i18n.getMessage("auto_detection2") + "\n" + chrome.i18n.getMessage("auto_detection3") + "\n\n" + chrome.i18n.getMessage("auto_detection4") );
	chrome.downloads.download({
		"url" : "chrome-extension://" + chrome.i18n.getMessage("@@extension_id") + "/options/DownloadControl.check",
		"conflictAction" : "overwrite" },
		function (id){ storage.checkId = id; });
}

function getFileTypes(rule){
	var ext_string = "";
	for(var i in rule.ext) ext_string += (ext_string === "" ? "" : ", ") + rule.ext[i];
	return ext_string;
}

// reorder rules:
function dragstart(event){
	console.log("start", event.target.dataset);
}
function dragover(event){
	event.preventDefault(); // enable dropping
	event.stopPropagation();

	var sibblings = event.toElement.parentNode.childNodes;
	for(var i = 0; i < sibblings.length; i++){
		if(sibblings[i].nodeName !== "TD") continue;

		sibblings[i].style.position = "relative";
		sibblings[i].style.top = "20px";
	}

	//console.log(event);
}
function dragleave(event){
	var sibblings = event.toElement.parentNode.childNodes;
	for(var i = 0; i < sibblings.length; i++){
		if(sibblings[i].nodeName !== "TD") continue;

		sibblings[i].style.position = "relative";
		sibblings[i].style.top = "0px";
	}
}
function dragend(event){
	console.log("end", event.target.dataset);
}