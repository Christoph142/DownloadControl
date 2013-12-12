window.alert = function(text){
	text = text.toString().replace(/\n/g, "<br>");
	
	var dialog = document.createElement("dialog");
	dialog.id = "sexy_dialog";
	dialog.innerHTML = "<div id='sexy_close_button'></div>\
						<div class='sexy_content_area'>"+text+"</div>\
						<div class='sexy_action_area'>\
							<div id='sexy_buttons'>\
								<button id='sexy_confirm'>OK</button>\
							</div>\
						</div>";
	
	document.documentElement.appendChild(dialog);
	
	document.getElementById("sexy_close_button").addEventListener("click", sexy_close, true); // close button
	document.getElementById("sexy_confirm").addEventListener("click", sexy_close, true); // confirm button
	window.addEventListener("keydown", sexy_check_key, true);
	
	dialog.showModal();
}

function sexy_close(returnValue){
	var dialog = document.getElementById("sexy_dialog");
	dialog.className = "close";
	window.removeEventListener("keydown", sexy_check_key, true);
	window.setTimeout( function(){
		dialog.close(returnValue);
		document.documentElement.removeChild(dialog);
	}, 200);
}

function sexy_check_key(){
	if(window.event.which === 13 || window.event.which === 27){ // Enter & Esc
		window.event.preventDefault();
		window.event.stopPropagation();
		sexy_close( window.event.which === 13 ? true : false );
	}
}