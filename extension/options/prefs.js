window.addEventListener("DOMContentLoaded", onInstall, false);
window.addEventListener("DOMContentLoaded", restoreprefs, false);
window.addEventListener("DOMContentLoaded", localize, false);
window.addEventListener("DOMContentLoaded", add_page_handling, false);

let prefs = {};

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
		}, syncedPrefs => {
			const serializedProps = ["contextMenu", "rules_both", "rules_url", "rules_ext", "suggestedRules"];
			serializedProps.forEach(p => {
				if (typeof syncedPrefs[p] === "string") syncedPrefs[p] = JSON.parse(syncedPrefs[p]);
			});
			prefs = syncedPrefs;
			console.log("prefs loaded", prefs);
			resolve();
		}
	));
}

window.addEventListener("change", function(e) // save preferences:
{
	if(e.target.id === "url" || e.target.id === "ext" || e.target.id === "dir") return; // saved via "Add"-button
	
	if(e.target.id.includes("defaultPath")){
		const p = correctPathFormat(e.target.value, e.target.id === "defaultPathBrowser" ? "absolute" : "relative");

		if(p !== false) 	e.target.value = p;
		else{ 				restoreprefs(); return; }
	}
	
	if(e.target.type === "checkbox") saveValue(e.target.id, e.target.checked ? "1" : "0");
	else if(e.target.type === "radio")
	{
		const radios = document.querySelectorAll("input[type=radio][name="+e.target.name+"]");
		for(let i = 0; i < radios.length; i++)
		{
			if(radios[i].checked){ saveValue(radios[i].name, radios[i].value); break; }
		}
	}
	else saveValue(e.target.id, e.target.value);
}, false);

chrome.runtime.onMessage.addListener( restoreprefs );
async function restoreprefs()
{
	await getPrefs();

	// get rules:
	const rule_arrays = ["rules_both", "rules_url", "rules_ext", "suggestedRules"];
	for(let i in rule_arrays)
	{
		const rules = rule_arrays[i];
		const rules_element = document.querySelector("#"+rules);

		// head:
		let head = "<tr>";
		if(rules !== "rules_ext") head += "<th>" + chrome.i18n.getMessage("website") + "</th>";
		if(rules !== "rules_url") head += "<th>" + chrome.i18n.getMessage("file_types") + "</th>";
		head += "<th>" + chrome.i18n.getMessage("directory") + "</th>";
		if(rules === "suggestedRules" && prefs[rules].length > 1) head += "<td class='delete_all_rules' id='delete_all_suggested_rules' data-from='"+rules+"'></td>";
		head += "</tr>";
		rules_element.innerHTML = head;

		// content:
		for(let i = 0; i < prefs[rules].length; i++)
		{
			let tr = "<tr class='rule' draggable='true' data-rule='"+rules+"."+i+"'>";
			if(rules !== "rules_ext") tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".url'>"+prefs[rules][i].url+"</td>";
			if(rules !== "rules_url") tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".ext'>"+prefs[rules][i].ext.join(", ")+"</td>";
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
	const delete_rule_buttons = document.querySelectorAll(".delete_rule");
	for(let i = 0; i < delete_rule_buttons.length; i++)
	{
		delete_rule_buttons[i].addEventListener("click", function(){
			prefs[this.dataset.from].splice([this.dataset.nr], 1);
			saveValue(this.dataset.from, prefs[this.dataset.from], restoreprefs);
		}, false);
	}

	// "delete all rules"-button:
	if(prefs["suggestedRules"].length > 1) document.querySelector("#delete_all_suggested_rules").addEventListener("click", function(){
		saveValue("suggestedRules", [], restoreprefs);
	}, false);

	// "move rule up"-buttons:
	const move_rule_up_buttons = document.querySelectorAll(".move_rule_up");
	for(let i = 0; i < move_rule_up_buttons.length; i++)
	{
		move_rule_up_buttons[i].addEventListener("click", function(){
			const helper = prefs[this.dataset.from][this.dataset.nr-1];
			prefs[this.dataset.from][this.dataset.nr-1] = prefs[this.dataset.from][this.dataset.nr];
			prefs[this.dataset.from][this.dataset.nr] = helper;
			saveValue(this.dataset.from, prefs[this.dataset.from], restoreprefs);
		}, false);
	}

	// "adopt rule"-buttons:
	const adopt_rule_buttons = document.querySelectorAll(".adopt_rule");
	for(let i = 0; i < adopt_rule_buttons.length; i++)
	{
		adopt_rule_buttons[i].addEventListener("click", function()
		{
			// get by reference:
			let rule = prefs.suggestedRules[this.dataset.nr];
			
			if(rule.url === "" && rule.ext.length === 0) alert( chrome.i18n.getMessage("incompleteInput") );
			else
			{
				// get original:
				rule = prefs.suggestedRules.splice([this.dataset.nr], 1)[0];

				if(rule.ext.length === 0){
					delete rule.ext;
					prefs.rules_url[prefs.rules_url.length] = rule;
					saveValue("rules_url", prefs.rules_url);
				}
				else if(rule.url === ""){
					delete rule.url;
					prefs.rules_ext[prefs.rules_ext.length] = rule;
					saveValue("rules_ext", prefs.rules_ext);
				}
				else{
					prefs.rules_both[prefs.rules_both.length] = rule;
					saveValue("rules_both", prefs.rules_both);
				}

				saveValue("suggestedRules", prefs.suggestedRules, restoreprefs);
			}
		}, false);
	}
	
	// reorder rules:
	const dragrules = document.querySelectorAll(".rule");
	for(let i = 0; i < dragrules.length; i++){
		dragrules[i].addEventListener("dragstart", dragstart, false);
		dragrules[i].addEventListener("dragover", dragover, false);
		dragrules[i].addEventListener("dragleave", dragleave, false);
		dragrules[i].addEventListener("dragend", dragend, false);
	}

	// get inputs:
	const inputs = document.querySelectorAll("input");	
	for(let i = 0; i < inputs.length; i++){
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
	const menu = document.querySelectorAll(".menu");
	for(let i = 0; i < menu.length; i++)
	{
		menu[i].addEventListener("click", function(){
			document.querySelectorAll(".selected")[0].className = "menu i18n";
			this.className = "menu i18n selected";
			document.querySelectorAll(".visible")[0].className = "invisible";
			document.querySelector("#content"+this.dataset.target).className = "visible";
		}, false);
	}
	
	// save new rules:
	document.querySelector("#add_rule").addEventListener("click", function(){
		if(document.querySelector("#url").value === "" && document.querySelector("#ext").value === "") alert( chrome.i18n.getMessage("incompleteInput") );
		else 
		{
			const dir = correctPathFormat(document.querySelector("#dir").value, "relative");
			if(dir === false) return;

			if(document.querySelector("#ext").value === "")
			{
				//#### duplication check
				prefs.rules_url[prefs.rules_url.length] = { "url" : document.querySelector("#url").value, "dir" : dir };
				saveValue("rules_url", prefs.rules_url, restoreprefs);
			}
			else if(document.querySelector("#url").value === "")
			{
				//#### duplication check
				prefs.rules_ext[prefs.rules_ext.length] = { "ext" : makeArray(document.querySelector("#ext").value), "dir" : dir };
				saveValue("rules_ext", prefs.rules_ext, restoreprefs);
			}
			else /* url & ext */
			{
				//#### duplication check
				prefs.rules_both[prefs.rules_both.length] = { "url" : document.querySelector("#url").value, "ext" : makeArray(document.querySelector("#ext").value), "dir" : dir };
				saveValue("rules_both", prefs.rules_both, restoreprefs);
			}

			// clear fields:
			document.querySelector("#url").value = document.querySelector("#ext").value = document.querySelector("#dir").value = "";
		}
	}, false);
	
	// change existing rules/folders:
	document.querySelector("#inputchangelistener").addEventListener("input", function(e){
		e.target.addEventListener("blur", handleChanges, false);
	}, false);
	function handleChanges(){ // &nbsp; !!!
		const t = window.event.target;
		let v = t.innerHTML;
		
		if		(t.dataset.rule.includes(".ext")) v = makeArray(t.innerHTML, t.dataset.rule.includes("suggestedRules")); // makeArray(string, may_be_empty)
		else if (t.dataset.rule.includes(".dir")) v = correctPathFormat(t.innerHTML, "relative");
		
		if(v !== false) saveValue(t.dataset.rule, v, restoreprefs);
		else 			restoreprefs();

		t.removeEventListener("blur", handleChanges, false);
	}

	// auto-detect default folder button:
	document.querySelector("#checkDefaultPathBrowser").addEventListener("click", function(){
		document.querySelector("#checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("checkDefaultPathBrowser");
		checkDefaultPathBrowser( function(){
			if(!prefs.defaultPathBrowser) document.querySelector("#checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("auto_detection_failed");
			else{
				document.querySelector("#defaultPathBrowser").value = prefs.defaultPathBrowser;
				document.querySelector("#checkDefaultPathBrowser").innerHTML = chrome.i18n.getMessage("auto_detection_succeeded");
			}
		});
	});	
}

function localize()
{
	const strings = document.querySelectorAll(".i18n");
	for(let i = 0; i < strings.length; i++)
	{
		if (strings[i].nodeName === "INPUT") 	strings[i].placeholder = chrome.i18n.getMessage(strings[i].dataset.i18n);
		else 									strings[i].innerHTML = chrome.i18n.getMessage(strings[i].dataset.i18n) + strings[i].innerHTML;
	}
}

// preselect Initial Setup page if not initialized yet:
function onInstall(){
	if(!(prefs.defaultPathBrowser?.length < 2)) return;

	const m = document.querySelectorAll("li");
	m[0].className = "i18n menu selected";
	m[1].className = "i18n menu";

	document.querySelector("#content0").className = "visible";
	document.querySelector("#content1").className = "invisible";
}

// Determine browser's default download folder:
function checkDefaultPathBrowser(callback){
	chrome.downloads.onChanged.addListener( function (change){
		if(change.filename?.current.includes("DownloadControl"))
			saveValue("defaultPathBrowser", change.filename.current.split("DownloadControl")[0], callback);
		if(change.state?.current === "complete" && prefs.checkId && change.id === prefs.checkId){
			// clean up at completion:
			delete prefs.checkId;
			chrome.downloads.removeFile(change.id);
			chrome.downloads.erase({ "id" : change.id });
		}
	});
	alert( chrome.i18n.getMessage("auto_detection1") + "\n" + chrome.i18n.getMessage("auto_detection2") + "\n" +
		   chrome.i18n.getMessage("auto_detection3") + "\n\n" + chrome.i18n.getMessage("auto_detection4"),
		function(){
			chrome.downloads.download({
				"url" : "chrome-extension://" + chrome.i18n.getMessage("@@extension_id") + "/options/DownloadControl.check",
				"conflictAction" : "overwrite"
			},
			function (id){ prefs.checkId = id; }
			);
		}
	);
}

// reorder rules:
function dragstart(event){
	console.log("start", event.target.dataset);
}
function dragover(event){
	event.preventDefault(); // enable dropping
	event.stopPropagation();

	let siblings = event.toElement.parentNode.childNodes;
	for(let i = 0; i < siblings.length; i++){
		if(siblings[i].nodeName !== "TD") continue;

		siblings[i].style.position = "relative";
		siblings[i].style.top = "20px";
	}

	//console.log(event);
}
function dragleave(event){
	let siblings = event.toElement.parentNode.childNodes;
	for(let i = 0; i < siblings.length; i++){
		if(siblings[i].nodeName !== "TD") continue;

		siblings[i].style.position = "relative";
		siblings[i].style.top = "0px";
	}
}
function dragend(event){
	console.log("end", event.target.dataset);
}

async function saveValue(key, value, callback)
{
	key = key.split("."); // split tree

	let saveobjectBranch = prefs;
	for(let i = 0; i < key.length-1; i++){ saveobjectBranch = saveobjectBranch[ key[i] ]; }
	saveobjectBranch[ key[key.length-1] ] = value;

	if( key[0] === "suggestedRules" ) value.sort(function(a, b) { return a.url.localeCompare(b.url); }); // sort alphabetically
	
	let saveobject = {};
	saveobject[key[0]] = typeof prefs[key[0]] === "string" ? prefs[key[0]] : JSON.stringify( prefs[ key[0] ] );

	chrome.storage.sync.set(saveobject);

	if( key[0] === "contextMenu" ) adjustContextMenu(); // update contextMenu if necessary

	if(typeof callback === "function") callback();
}

function correctPathFormat(p, type)
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

function makeArray(ext_string, may_be_empty)
{
	ext_string = ext_string.replaceAll(" ", ""); // remove all blanks
	ext_string = ext_string.replaceAll(".", ""); // remove all dots
	
	const ext_array = ext_string.toLowerCase().split(",");
	for(let i = ext_array.length-1; i >= 0; i--) if(ext_array[i] === "") ext_array.splice(i, 1);

	return ( (ext_array.length > 0 || may_be_empty) ? ext_array : false );
}

async function adjustContextMenu(){
	const p = await getPrefs();
	chrome.contextMenus.removeAll( function(){
		if( p.contextMenu.open === "1" ) chrome.contextMenus.create({ "id" : "dc_open", "contexts" : ["link"], "title" : chrome.i18n.getMessage("open") });
		if( p.contextMenu.save === "1" ) chrome.contextMenus.create({ "id" : "dc_save", "contexts" : ["link"], "title" : chrome.i18n.getMessage("save") });
	});
}
