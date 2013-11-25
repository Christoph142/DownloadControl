window.addEventListener("DOMContentLoaded", restoreprefs, false);
window.addEventListener("DOMContentLoaded", localize, false);

var bg = chrome.extension.getBackgroundPage();
var storage = bg.w;

window.addEventListener("change", function(e) // save preferences:
{
	if(e.target.id === "url" || e.target.id === "ext" || e.target.id === "dir") return; // handled via onclick funtions
	
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
	var saveobject = {};
	saveobject[key] = value;
	chrome.storage.sync.set(saveobject);	// save it in Chrome's synced storage
	bg.w[key] = value;						// update settings in bg
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
			if(storage[rules][i].url) tr += "<td>"+storage[rules][i].url+"</td>";
			if(storage[rules][i].ext) tr += "<td>"+getFileTypes(storage[rules][i])+"</td>";
			tr += "<td>"+storage[rules][i].dir+"</td><td class='delete_rule' data-nr='"+i+"' data-from='"+rules+"'></td></tr>";
			
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
	
	// add saving rules:
	document.getElementById("add_rule").addEventListener("click", function(){
		if((document.getElementById("url").value === "" && document.getElementById("ext").value === "") || document.getElementById("dir").value === "")
			alert("You need to enter a website and/or a file type plus the subdirectory you wanna save the files in.");
		else 
		{
			var dir = document.getElementById("dir").value;
			if(dir[dir.length-1] !== "/") dir += "/";
			
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
	
	//help:
	document.getElementById("close_help").addEventListener("click", function(e){
		e.preventDefault(); e.stopPropagation();
		document.getElementById("help").style.display = "none";
	}, false);
	
	// prevent shifting of page by scrollbars:
	scrollbarHandler.registerCenteredElement(document.getElementById('tool-container'));
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