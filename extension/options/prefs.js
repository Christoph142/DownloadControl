window.addEventListener("DOMContentLoaded", onInstall, false);
window.addEventListener("DOMContentLoaded", restoreprefs, false);
window.addEventListener("DOMContentLoaded", localize, false);
window.addEventListener("DOMContentLoaded", add_page_handling, false);

let prefs = null;
let ready = false;

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
		}, storage => {
			prefs = storage;
			resolve(prefs);
		}
	));
}

window.addEventListener("change", function(e) // save preferences:
{
	if(e.target.id === "url" || e.target.id === "ext" || e.target.id === "dir") return; // saved via "Add"-button
	
	if(e.target.id.indexOf("defaultPath") !== -1){
		if(e.target.id === "defaultPathBrowser")	var p = correct_path_format(e.target.value, "absolute");
		else 										var p = correct_path_format(e.target.value, "relative");

		if(p !== false) 	e.target.value = p;
		else{ 				restoreprefs(); return; }
	}
	
	if(e.target.type === "checkbox") save_new_value(e.target.id, e.target.checked ? "1" : "0");
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

chrome.runtime.onMessage.addListener( restoreprefs );
async function restoreprefs()
{
	await getPrefs();
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
		head += "<th>" + chrome.i18n.getMessage("directory") + "</th>";
		if(rules === "suggestedRules" && prefs[rules].length > 1) head += "<td class='delete_all_rules' id='delete_all_suggested_rules' data-from='"+rules+"'></td>";
		head += "</tr>";
		rules_element.innerHTML = head;

		// content:
		for(var i = 0; i < prefs[rules].length; i++)
		{
			var tr = "<tr class='rule' draggable='true' data-rule='"+rules+"."+i+"'>";
			if(rules !== "rules_ext") tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".url'>"+prefs[rules][i].url+"</td>";
			if(rules !== "rules_url") tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".ext'>"+getFileTypes(prefs[rules][i])+"</td>";
			tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".dir'>"+prefs[rules][i].dir+"</td>\
				   <td class='delete_rule' data-nr='"+i+"' data-from='"+rules+"'></td>";
			if(rules === "suggestedRules") 	tr += "<td class='adopt_rule' data-nr='"+i+"'></td>";
			else if(i > 0)					tr += "<td class='move_rule_up' data-from='"+rules+"' data-nr='"+i+"'></td>";
			tr += "</tr>";

			rules_element.innerHTML += tr;
		}
		
		if(prefs[rules].length === 0) rules_element.innerHTML += "<br><span>" + chrome.i18n.getMessage("no_rules_yet") + "</span>";
	}

	// "delete rule"-buttons:
	var delete_rule_buttons = document.getElementsByClassName("delete_rule");
	for(var i = 0; i < delete_rule_buttons.length; i++)
	{
		delete_rule_buttons[i].addEventListener("click", function(){
			prefs[this.dataset.from].splice([this.dataset.nr], 1);
			save_new_value(this.dataset.from, prefs[this.dataset.from], restoreprefs);
		}, false);
	}

	// "delete all rules"-button:
	if(prefs["suggestedRules"].length > 1) document.getElementById("delete_all_suggested_rules").addEventListener("click", function(){
		save_new_value("suggestedRules", [], restoreprefs);
	}, false);

	// "move rule up"-buttons:
	var move_rule_up_buttons = document.getElementsByClassName("move_rule_up");
	for(var i = 0; i < move_rule_up_buttons.length; i++)
	{
		move_rule_up_buttons[i].addEventListener("click", function(){
			var helper = prefs[this.dataset.from][this.dataset.nr-1];
			prefs[this.dataset.from][this.dataset.nr-1] = prefs[this.dataset.from][this.dataset.nr];
			prefs[this.dataset.from][this.dataset.nr] = helper;
			save_new_value(this.dataset.from, prefs[this.dataset.from], restoreprefs);
		}, false);
	}

	// "adopt rule"-buttons:
	var adopt_rule_buttons = document.getElementsByClassName("adopt_rule");
	for(var i = 0; i < adopt_rule_buttons.length; i++)
	{
		adopt_rule_buttons[i].addEventListener("click", function()
		{
			// get by reference:
			var rule = prefs.suggestedRules[this.dataset.nr];
			
			if(rule.url === "" && rule.ext.length === 0) alert( chrome.i18n.getMessage("incompleteInput") );
			else
			{
				// get original:
				rule = prefs.suggestedRules.splice([this.dataset.nr], 1)[0];

				if(rule.ext.length === 0){
					delete rule.ext;
					prefs.rules_url[prefs.rules_url.length] = rule;
					save_new_value("rules_url", prefs.rules_url);
				}
				else if(rule.url === ""){
					delete rule.url;
					prefs.rules_ext[prefs.rules_ext.length] = rule;
					save_new_value("rules_ext", prefs.rules_ext);
				}
				else{
					prefs.rules_both[prefs.rules_both.length] = rule;
					save_new_value("rules_both", prefs.rules_both);
				}

				save_new_value("suggestedRules", prefs.suggestedRules, restoreprefs);
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
		if( !prefs[inputs[i].id] && !prefs[inputs[i].name] && inputs[i].id.split(".")[0] !== "contextMenu") continue;
		
		if( inputs[i].type === "checkbox" ){
			if(inputs[i].id.split(".")[0] === "contextMenu") inputs[i].checked = (prefs["contextMenu"][ inputs[i].id.split(".")[1] ] === "1" ? true : false);
			else 											 inputs[i].checked = (prefs[inputs[i].id] === "0" ? false : true);
		}
		else if ( inputs[i].type === "radio" ){	if( inputs[i].value === prefs[inputs[i].name] ) inputs[i].checked = true; }
		else									inputs[i].value = prefs[inputs[i].id];
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
			var dir = correct_path_format(document.getElementById("dir").value, "relative");
			if(dir === false) return;

			if(document.getElementById("ext").value === "")
			{
				//#### duplication check
				prefs.rules_url[prefs.rules_url.length] = { "url" : document.getElementById("url").value, "dir" : dir };
				save_new_value("rules_url", prefs.rules_url, restoreprefs);
			}
			else if(document.getElementById("url").value === "")
			{
				//#### duplication check
				prefs.rules_ext[prefs.rules_ext.length] = { "ext" : make_array(document.getElementById("ext").value), "dir" : dir };
				save_new_value("rules_ext", prefs.rules_ext, restoreprefs);
			}
			else /* url & ext */
			{
				//#### duplication check
				prefs.rules_both[prefs.rules_both.length] = { "url" : document.getElementById("url").value, "ext" : make_array(document.getElementById("ext").value), "dir" : dir };
				save_new_value("rules_both", prefs.rules_both, restoreprefs);
			}

			// clear fields:
			document.getElementById("url").value = document.getElementById("ext").value = document.getElementById("dir").value = "";
		}
	}, false);
	
	// change existing rules/folders:
	document.getElementById("inputchangelistener").addEventListener("input", function(e){
		e.target.addEventListener("blur", handleChanges, false);
	}, false);
	function handleChanges(){ // &nbsp; !!!
		var t = window.event.target;
		var v = t.innerHTML;
		
		if		(t.dataset.rule.indexOf(".ext") !== -1) v = make_array(t.innerHTML, ( t.dataset.rule.indexOf("suggestedRules") !== -1 ? true : false) ); // make_array(string, may_be_empty)
		else if (t.dataset.rule.indexOf(".dir") !== -1) v = correct_path_format(t.innerHTML, "relative");
		
		if(v !== false) save_new_value(t.dataset.rule, v, restoreprefs);
		else 			restoreprefs();

		t.removeEventListener("blur", handleChanges, false);
	}

	// auto-detect default folder button:
	document.getElementById("checkDefaultPathBrowser").addEventListener("click", function(){
		checkDefaultPathBrowser( function(){
			if(!prefs.defaultPathBrowser) document.getElementById("checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("auto_detection_failed");
			else{
				document.getElementById("defaultPathBrowser").value = prefs.defaultPathBrowser;
				document.getElementById("checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("auto_detection_succeeded");
			}
		});
	});	
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
	if(prefs.defaultPathBrowser.length > 2) return;

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
			save_new_value("defaultPathBrowser", change.filename.current.split("DownloadControl")[0], callback);
		if(change.state && prefs.checkId) if(change.id === prefs.checkId && change.state.current === "complete"){
			// clean up at completion:
			delete prefs.checkId;
			chrome.downloads.removeFile(change.id);
			chrome.downloads.erase({ "id" : change.id });
		}
	});
	alert( chrome.i18n.getMessage("auto_detection1") + "\n" + chrome.i18n.getMessage("auto_detection2") + "\n" + chrome.i18n.getMessage("auto_detection3") + "\n\n" + chrome.i18n.getMessage("auto_detection4"),
		function(){
			chrome.downloads.download({
				"url" : "chrome-extension://" + chrome.i18n.getMessage("@@extension_id") + "/options/DownloadControl.check",
				"conflictAction" : "overwrite" },
				function (id){ prefs.checkId = id; }
			);
		}
	);
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