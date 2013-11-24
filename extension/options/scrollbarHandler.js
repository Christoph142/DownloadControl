/* Utility to prevent page width "jumping" when scrollbar (dis)appears
 *
 * Usage:
 *
 > scrollbarHandler.registerCenteredElement(document.getElementById('tool-container'));
 * when loading the page
 * to set element margins to be centered
 * and to register window resize event callback
 * Argument is the element which should be centered
 */

window.scrollbarHandler = new function() {
  var _cachedWidth = 0;
  var _element = null;
  var _originalMaxWidth = 1000000;
  var _extraPadding = 0;
  var _adjustment_scheduled = false;

  this.__defineGetter__('scrollbarWidth', function() {
    if(_cachedWidth)
      return _cachedWidth;
    var element = document.createElement('div');
    element.style.position = 'absolute';
    element.style.left = '-1000px';
    element.style.width = '200px';
    element.style.height = '200px';
    element.style.overflow = 'auto';
    var subElement = document.createElement('div');
    subElement.style.height = '500px';
    element.appendChild(subElement);
    document.body.appendChild(element);
    var width = element.getBoundingClientRect().width;
    var inner_width = subElement.getBoundingClientRect().width;
    document.body.removeChild(element);
    _cachedWidth = width - inner_width;
    return _cachedWidth;
  });

  this._adjust = function() {
    if(!_element || !_element.style || _adjustment_scheduled)
      return;

    _adjustment_scheduled = true;
    window.requestAnimationFrame(actual_adjust_bound);
  };

  var actual_adjust = function()
  {
    _adjustment_scheduled = false;
    var availableWidth = window.innerWidth - this.scrollbarWidth - _extraPadding;
    var elementWidth = _element.getBoundingClientRect().width;
    _element.style.webkitMarginStart = Math.max(0, Math.floor((availableWidth - elementWidth)/2)) + 'px';
    _element.style.maxWidth = Math.min(availableWidth, _originalMaxWidth) + 'px';
  };

  var actual_adjust_bound = actual_adjust.bind(this);

  this.isRegistered = function() {
    return _element !== null;
  };

  this.registerCenteredElement = function (newElement) {
    _element = newElement;
    var style = window.getComputedStyle(_element);
    // Note: assumes values were set in pixels
    _originalMaxWidth = parseInt(style.getPropertyValue('max-width')) || 1000000;
    _extraPadding = (parseInt(style.getPropertyValue('padding-left'))  || 0) +
                    (parseInt(style.getPropertyValue('padding-right')) || 0);
    window.addEventListener('resize', this._adjust.bind(this), true);
    this._adjust();
  };

  Object.defineProperties(window, {"wp": {set: function() {}}});
};