window.addEventListener("DOMContentLoaded", restoreprefs, false);
window.addEventListener("DOMContentLoaded", localize, false);

var bg = chrome.extension.getBackgroundPage();
var storage = bg.w;

window.addEventListener("change", function(e) // save preferences:
{
	if(e.target.id === "url" || e.target.id === "ext" || e.target.id === "dir") return; // saved via "Add"-button
	
	if(e.target.id === "defaultPath") e.target.value = correct_path_format(e.target.value);
	
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

function save_new_value(key, value)
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
}

function restoreprefs()
{
	// get rules:
	var rule_arrays = ["rules_both", "rules_url", "rules_ext"];
	for(var i in rule_arrays)
	{
		rules = rule_arrays[i];
		for(var i = 0; i < storage[rules].length; i++)
		{
			var tr = "<tr class='rule'>";
			if(storage[rules][i].url) tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".url'>"+storage[rules][i].url+"</td>";
			if(storage[rules][i].ext) tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".ext'>"+getFileTypes(storage[rules][i])+"</td>";
			tr += "<td contenteditable spellcheck='false' data-rule='"+rules+"."+i+".dir'>"+storage[rules][i].dir+"</td>\
				   <td class='delete_rule' data-nr='"+i+"' data-from='"+rules+"'></td></tr>";
			
			document.getElementById(rules).innerHTML += tr;
		}
		
		if(storage[rules].length === 0) document.getElementById(rules).innerHTML += "<br><span>No rules yet</span>";
	}
	// delete rule buttons:
	var delete_rule_buttons = document.getElementsByClassName("delete_rule");
	for(var i = 0; i < delete_rule_buttons.length; i++)
	{
		delete_rule_buttons[i].addEventListener("click", function(){
			storage[this.dataset.from].splice([this.dataset.nr], 1);
			save_new_value(this.dataset.from, storage[this.dataset.from]);
			location.reload();
		}, false);
	}
	
	// get inputs:
	var inputs = document.getElementsByTagName("input");	
	for(var i = 0; i < inputs.length; i++){
		if( !storage[inputs[i].id] && !storage[inputs[i].name] ) continue;
		
		if( inputs[i].type === "checkbox" )		inputs[i].checked = (storage[inputs[i].id] === "0" ? false : true);
		else if ( inputs[i].type === "radio" ){	if( inputs[i].value === storage[inputs[i].name] ) inputs[i].checked = true; }
		else									inputs[i].value = storage[inputs[i].id];
	}
	
	add_page_handling(storage);
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

function add_page_handling(storage)
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
			alert(chrome.i18n.getMessage("insufficient_input"));
		else 
		{
			var dir = correct_path_format(document.getElementById("dir").value);
			
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
		location.reload();
	}, false);
	
	// change existing rules:
	document.getElementById("inputchangelistener").addEventListener("input", function(e){ // &nbsp; !!!
		if		(e.target.dataset.rule.indexOf(".ext") !== -1)	save_new_value(e.target.dataset.rule, make_array(e.target.innerHTML));
		else if (e.target.dataset.rule.indexOf(".dir") !== -1) 	save_new_value(e.target.dataset.rule, correct_path_format(e.target.innerHTML));
		else	/* url match */									save_new_value(e.target.dataset.rule, e.target.innerHTML);
	}, false);

	//help:
	document.getElementById("close_help").addEventListener("click", function(e){
		e.preventDefault(); e.stopPropagation();
		document.getElementById("help").style.display = "none";
	}, false);
	
	// prevent shifting of page caused by scrollbars:
	scrollbarHandler.registerCenteredElement(document.getElementById('tool-container'));
}

function correct_path_format(p)
{
	p = p.replace(/\//gi, "\\");			// convert forward slashes into back slashes
	if(p[0] === "\\") p = p.substring(1);	// no slash at beginning
	if(p[p.length-1] !== "\\") p += "\\";	// slash at end
	
	return p;
}

function localize()
{
	if(chrome.i18n.getMessage("lang") === "ar" || chrome.i18n.getMessage("lang") === "ur_PK") document.body.dir = "rtl";
	
	var strings = document.getElementsByClassName("i18n");
	for(var i = 0; i < strings.length; i++)
	{
		if(strings[i].tagName === "IMG")	strings[i].title = chrome.i18n.getMessage(strings[i].title); // tooltips
		else								strings[i].innerHTML = chrome.i18n.getMessage(strings[i].dataset.i18n) + strings[i].innerHTML;
	}
}

var bubble_setback; // timeout for info bubbles