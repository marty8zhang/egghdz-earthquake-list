/**
 * @createdOn 13/05/2018, 1:35:12 PM
 * @author Marty Zhang
 * @version 1.0.201807160144
 */
var remoteURL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/';
// Google Maps related variables.
var defaultMapZoom = 2;
var defaultMapCenter = {
  lat: -28.024,
  lng: 140.887
};
var currentInfoWindow = null;
var infoWindowMaxWidth = 675;
var markerClusterer = null;
var mapOptions = {
  zoom: defaultMapZoom,
  center: defaultMapCenter,
  scaleControl: true,
  mapTypeControl: true,
  fullscreenControl: true,
};
var map = new google.maps.Map(document.getElementById('earthquake-map'), mapOptions);
var geocoder = new google.maps.Geocoder();
var markers = [];
// Timezone & locale related variables.
var timezones = moment.tz.names();
var locales = moment.locales();
var currentTimezone = moment.tz.guess();
var currentLocale = 'en-au';
// Location related variables.
var currentLocation = '';
var currentLocationMarker = null;
var selectedRadius = '';
var currentLocationCircle = null;

jQuery(function ($) {
  $(window).on('resize', function () {
    var infoWindowPadding = 20; // For one side, in pixels.

    if ($(window).width() <= 568) {
      mapOptions.mapTypeControl = false;
      infoWindowPadding = 10;
    } else {
      mapOptions.mapTypeControl = true;
    }
    if ($(window).width() < 992) {
      mapOptions.fullscreenControl = false;
    } else {
      mapOptions.fullscreenControl = true;
    }

    infoWindowMaxWidth = $('#earthquake-map').innerWidth() - infoWindowPadding * 2 - 53; // 53px is the width that Google Maps' Info Window interface adds in.

    if (currentInfoWindow) {
      currentInfoWindow.setOptions({
        maxWidth: infoWindowMaxWidth,
      });
    }
    map.setOptions(mapOptions);
  }).trigger('resize');

  $("#scroll-down-button a[href^='#']").on('click', function (e) {
    e.preventDefault();
    $('html, body').animate({
      scrollTop: $($(this).attr('href')).offset().top
    }, 500, 'linear');
  });

  $('#form-timezone-locale').on('submit', function (e) {
    /* Development Note: This is the correct place, instead of listening to the button click event, to prevent the form from being submitted. */
    e.preventDefault();
  });

  // Initialises the Reset button.
  $('#btn-update-map').on('click', function () {
    $('#loader-wrapper').removeClass('hidden');
    $('#loader-message').text('Initialising...');

    $('#messages').empty();

    $('#btn-back-to-map').trigger('click');

    resetTimezoneAndLocale(); // This needs to be called before resetMap().

    resetLocation(resetMap);

    $('#earthquake-details').empty();

    /* Development Note: Because there are some asynchronous processes above, here isn't the right place to hide the loader. */
//    hideLoader();
  })
          .trigger('click');

  // Initialises the Back to Map button.
  $('#btn-back-to-map').on('click', function () {
    if ($(window).width() < 992) {
      $('html, body').animate({
        scrollTop: 0,
      });
    }
  });
});

/**
 * Resets/initialises the Timezone & Locale selectors and the related functionality.
 */
function resetTimezoneAndLocale() {
  var $ = jQuery;
  var timezoneOptions = '';
  var localeOptions = '';

  $('#loader-message').text('Setting up your timezone & locale...');

  currentTimezone = $('#timezone-selector').val() ? $('#timezone-selector').val() : currentTimezone;
  for (var i = 0; i < timezones.length; i++) {
    timezoneOptions += '<option value="' + timezones[i] + '"' + (timezones[i] === currentTimezone ? ' selected' : '') + '>' + timezones[i] + '</option>';
  }
  $('#timezone-selector').empty()
          .html(timezoneOptions);

  currentLocale = $('#locale-selector').val() ? $('#locale-selector').val() : currentLocale;
  for (var i = 0; i < locales.length; i++) {
    localeOptions += '<option value="' + locales[i] + '"' + (locales[i] === currentLocale ? ' selected' : '') + '>' + locales[i] + '</option>';
  }
  $('#locale-selector').empty()
          .html(localeOptions);

  /*
   * Development Notes:
   *   # moment-timezone related features (tz.setDefault() in the below case) must be called before locale().
   *   # Even though moment.js acts as the default timezone was set to the returned value of tz.guess(), you'll still need to set the default timezone explicitly; otherwise, tz() will returned as 'undefined'.
   */
  moment.tz.setDefault(currentTimezone).locale(currentLocale); // Sets the default timezone & locale.
}

/**
 * Resets/initialises the map based on the current or given location.
 * @param {Object} [callback] The callback function if any. If will only be called when there is no error beforehand.
 */
function resetLocation(callback) {
  var $ = jQuery;
  selectedRadius = $('#radius-selector').val();

  $('#loader-message').text('Determining your location...');

  if (currentLocationCircle) {
    currentLocationCircle.setMap(null); // Removes the circle that represents the selected radius.
  }

  var tempLocation = $('#my-location').val().trim();
  if (tempLocation) {
    var tempCoordinate = tempLocation.split(tempLocation.includes(', ') ? ', ' : ',');
    if (isValidCoordinate(tempCoordinate)) {
      currentLocation = new google.maps.LatLng(tempCoordinate[0], tempCoordinate[1]);
      $('#my-location').val(tempCoordinate[0] + ', ' + tempCoordinate[1]);

      resetPositionMarker();

      if (callback) {
        callback();
      }
    } else {
      geocoder.geocode({
        'address': tempLocation,
      }, function (geocoderResult, geoStatus) {
        if (geoStatus === 'OK') {
          currentLocation = geocoderResult[0].geometry.location;
          $('#my-location').val(geocoderResult[0].formatted_address);

          resetPositionMarker();

          if (callback) {
            callback();
          }
        } else {
          displayLocationError({
            code: 1001, // Makes up our own error code to comply with the method signature.
            message: "Geocode was not successful for the following reason: " + geoStatus,
          });
        }
      });
    }
  } else { // Tries to auto detect the visitor's location.
    // Tries HTML5 geolocation.
    if (navigator.geolocation) {
      var positionOptions = {
        enableHighAccuracy: true,
        timeout: 10000, // In milliseconds.
        maximumAge: 300000, // The maximum age in milliseconds of a possible cached position that is acceptable to return.
      };

      navigator.geolocation.getCurrentPosition(function (position) {
        currentLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        $('#my-location').val(position.coords.latitude + ', ' + position.coords.longitude);

        resetPositionMarker();

        if (callback) {
          callback();
        }
      }, displayLocationError, positionOptions);
    } else {
      displayLocationError({
        code: 1002, // Makes up our own error code to comply with the method signature.
        message: "Your browser doesn't support location auto detection.",
      });
    }
  }
}

/**
 * Gets the remote JSON data and resets/updates the map when ready.
 */
function resetMap() {
  var $ = jQuery;

  $('#loader-message').text('Retrieving the earthquake data...');

  if (currentInfoWindow) {
    currentInfoWindow.close();
  }

  $.ajax({
    url: remoteURL + $('#feed-selector').val(),
    dataType: 'json',
  })
          .fail(function () {
            displayMessages([
              {
                message: 'An error occurred. It is most likely that the server of USGS\'s Earthquake Hazards Program is not available at the moment.'
              }
            ]);

            hideLoader();
          })
          .done(function (data) {
            if (!isRawDataValid(data)) {
              displayMessages([
                {
                  message: 'An error occurred. The returned data from the server of USGS\'s Earthquake Hazards Program is invalid.'
                }
              ]);

              hideLoader();
            } else {
//              logMessage(data.features);

              markers = getMarkers(data.features);

              markerClusterer = getMarkerCluster(markers);

              var selectedFeed = $('#feed-selector > option:selected').text().toLowerCase();
              displayMessages([
                {
                  message: markers.length + (selectedFeed.includes('significant') ? ' significant' : '') + " earthquake(s) detected in the selected area " + selectedFeed.replace(' (significant)', '') + ".",
                  type: 'info'
                }
              ]);
            }
          });
}

/*
 * Resets/initialises a marker for My Position on the map, draws a circle around it (if there is a selected radius), re-centers the map, and sets the proper zoom level for the map.
 */
function resetPositionMarker() {
  var $ = jQuery;
  var markerOptions = {
    position: currentLocation,
    map: map,
    infoWindow: null, // In case there is a previous binding.
    zIndex: 2147483647, // Makes sure no other marker is on top of this one. Development Note: Marker Clusterer icons belong to a different google.maps.MapPanes object, which has a higher z-index value, hence the My Location marker might still be overlapped by one of those.
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      strokeWeight: 2,
      strokeColor: '#FFF',
      fillColor: '#00F',
      fillOpacity: 1,
      scale: 6,
    },
  };

  $('#loader-message').text('Dropping your location marker...');

  if (currentLocationMarker) { // There is an existing marker for the 'My Location' field.
    currentLocationMarker.setOptions(markerOptions);
  } else {
    currentLocationMarker = new google.maps.Marker(markerOptions);
  }

  if (selectedRadius) { // If there is a selected radius, draws a circle around the current location marker.
    var circleOptions = {
      map: map,
      center: currentLocation,
      radius: selectedRadius * 1000, // Development Note: The radius is in metres.
      strokeWeight: 1,
      fillColor: '#00F',
      fillOpacity: 0.1,
    };

    if (currentLocationCircle) {
      currentLocationCircle.setOptions(circleOptions);
    } else {
      currentLocationCircle = new google.maps.Circle(circleOptions);
    }
  }

  mapOptions.center = currentLocation;
  mapOptions.zoom = determineMapZoom();
  map.setOptions(mapOptions);
}

/**
 * Checks if a given array represents a valid coordinate.
 * @param {Number[]} coordinate An array [latitude, longitude] which represents a coordinate. Note: Its values must be in the number format.
 * @return {Boolean} true if the given array represents a valid coordinate; or false otherwise.
 */
function isValidCoordinate(coordinate) {
  var result = false;

  if (coordinate && Array.isArray(coordinate) && coordinate.length == 2 && !isNaN(coordinate[0]) && coordinate[0] >= -90 && coordinate[0] <= 90 && !isNaN(coordinate[1]) && coordinate[1] >= -180 && coordinate[1] <= 180) {
    result = true;
  }

  return result;
}

/**
 * Identifies the location-related error and displays the error message.
 * @param {Object} error An object of the location-related error. Format: {code: ..., message: '...'}.
 */
function displayLocationError(error) {
  var message = 'Error: ';

  switch (error.code) {
    case error.PERMISSION_DENIED:
      message += "The Geolocation request can't be fulfilled through an insecure connection (e.g., non-HTTPS) or you denied the Geolocation request.";
      break;

    case error.POSITION_UNAVAILABLE:
      message += "Location information is unavailable.";
      break;

    case error.TIMEOUT:
      message += "The request to get user location timed out.";
      break;

    case error.UNKNOWN_ERROR:
      message += "An unknown error occurred.";
      break;

    default:
      message += error.message;
  }

  displayMessages([
    {
      message: message,
    },
  ]);

  /* Development Note: It might not be a good practise to put the below code here. However, doing this can guarantee the code being executed whenever there is a location related error, which also represents an exit point of the whole map initialising process. */
  hideLoader();
}

/**
 * Displays the given messages in the designated container.
 * @param {Object} messages The messages array structured as [{message: '...', type: '...'}, ...]. Note: The acceptable types are: muted, primary, success, info, warning, & danger, which are referencing the corresponding Bootstrap class names. 'type' is optional and defaults to 'danger'.
 */
function displayMessages(messages) {
  var $ = jQuery;
  var messageList = '<ul>';

  if (messages.length && messages[0].message.trim()) { // There should be at least one message.
    for (var i = 0; i < messages.length; i++) {
      var message = messages[i].message;
      var messageType = messages[i].type;

      if (message) {
        switch (messageType) {
          case 'muted':
            messageType = 'text-muted';
            break;

          case 'primary':
            messageType = 'text-primary';
            break;

          case 'success':
            messageType = 'text-success';
            break;

          case 'info':
            messageType = 'text-info';
            break;

          case 'warning':
            messageType = 'text-warning';
            break;

          case 'danger':
          default:
            messageType = 'text-danger';
        }

        messageList += '<li class="' + messageType + '">' + message + '</li>';
      }
    }

    messageList += '</ul>';
    $('#messages').html(messageList);
  }
}

/**
 * Hides the loader layer and clears its content.
 */
function hideLoader() {
  var $ = jQuery;

  $('#loader-wrapper').addClass('hidden');
  $('#loader-message').text('');
}

/**
 * Determines the map zoom level based on the value of the radius selector.
 * @return {integer} The map zoom level based on the value of the selected radius or the default map zoom level set during initialisation.
 */
function determineMapZoom() {
  var result = defaultMapZoom;

  switch (parseInt(selectedRadius)) {
    case 50:
      result = 9;
      break;

    case 100:
      result = 8;
      break;

    case 200:
      result = 7;
      break;

    case 500:
      result = 6;
      break;

    case 1000:
      result = 5;
      break;

    case 2000:
      result = 4;
      break;

    case 5000:
      result = 3;
      break;
  }

  return result;
}

/**
 * Checks if the raw data returned by the server of USGS\'s Earthquake Hazards Program is valid.
 * @param {JSON} rawData The raw data returned by the server of USGS\'s Earthquake Hazards Program.
 * @return {Boolean} Returns true if the raw data returned by the server of USGS\'s Earthquake Hazards Program is valid; or false otherwise.
 */
function isRawDataValid(rawData) {
  return typeof rawData.metadata.status !== 'undefined' && rawData.metadata.status === 200 && typeof rawData.features !== 'undefined' || rawData.features.constructor === Array;
}

/**
 * Gets an array of Google Maps Markers from the raw location data.
 * @param {JSON} rawLocationData The raw location data that were extracted from the returned data of the server of USGS\'s Earthquake Hazards Program.
 * @return {google.maps.Marker[]} An array of Google Maps Markers.
 */
function getMarkers(rawLocationData) {
  var $ = jQuery;
  var result = [];

  $('#loader-message').text('Dropping earthquake markers...');

  if (rawLocationData && rawLocationData.constructor === Array && rawLocationData.length) {
    var j = 0; // The marker index of the returned array. This array will be strored in the global 'markers' variable.

    for (i = 0; i < rawLocationData.length; i++) {
      var location = rawLocationData[i];
      var latLng = new google.maps.LatLng(location.geometry.coordinates[1], location.geometry.coordinates[0]);

      if (selectedRadius == '' || Math.ceil(google.maps.geometry.spherical.computeDistanceBetween(currentLocation, latLng) / 1000) <= selectedRadius) { // Worldwide or within the selected radius. Development Note: computeDistanceBetween() returns a value in metres.
//            var locationTime = new Date(location.properties.time); // The raw value is the number of milliseconds since the epoch.
        var locationTime = moment(location.properties.time); // The raw value is the number of milliseconds since the epoch.

        var markerContent = '<h3 class="google-map-marker-title">' + location.properties.place + '</h3>';
        markerContent += '<div class="google-map-marker-content">';
//            markerContent += '<p><strong>Time:</strong> ' + locationTime.toLocaleString('en-AU') + '</p>';
        markerContent += '<p><strong>Time:</strong> ' + locationTime.format('LLLL Z') + '</p>';
        markerContent += '<p><strong>Latitude:</strong> ' + location.geometry.coordinates[1] + '<br><strong>Longitude:</strong> ' + location.geometry.coordinates[0] + '<br><strong>Depth:</strong> ' + location.geometry.coordinates[2] + ' km</p>';
        markerContent += '<p><strong>Magnitude:</strong> ' + location.properties.mag + '</p>';
        markerContent += '</div><\!-- .google-map-marker-content --\>';
        markerContent += '<div class="google-map-marker-content-more"><p class="buttons"><button id="show-details-' + j + '" class="btn btn-default">Show Details</button><button id="set-as-my-location-' + j + '" class="btn btn-default" data-marker-index="' + j + '">Set as My Location</button></p></div>';

        var infoWindow = new google.maps.InfoWindow({
          content: markerContent,
          maxWidth: 247,
        });
        var marker = new google.maps.Marker({
          position: latLng,
          map: map,
          infoWindow: infoWindow,
          rawData: location,
        });

        google.maps.event.addListener(marker, 'click', getMarkerClickListener(marker, j));

        result.push(marker);

        j++;
      }
    }
  }

  return result;
}

/**
 * Gets the click listener of a given marker.
 * Development Notes:
 *   - This helper method helps with setting up the correct index number of the 'Show Details' & 'Set as My Location' buttons.
 *   - The first parameter was introduced only for readability purposes. It can be replaced by the 'this' keyword within the scope of this method.
 * @param {google.maps.Marker} thisMarker The given marker.
 * @param {integer} markerIndex The index number of the given marker based on the remote data.
 * @return {Function} The listener for the marker click event.
 */
function getMarkerClickListener(thisMarker, markerIndex) {
  var $ = jQuery;

  return function () {
    $('#earthquake-details').empty();

    if (currentInfoWindow) {
      currentInfoWindow.close();
    }
    thisMarker.infoWindow.setOptions({
      maxWidth: infoWindowMaxWidth,
    });
    thisMarker.infoWindow.open(map, thisMarker);
    currentInfoWindow = thisMarker.infoWindow;

    // The 'Show Details' button.
    $('.google-map-marker-content-more #show-details-' + markerIndex).on('click', function () {
      $('#earthquake-details').html('<h4>Earthquake Detail:</h4><div class="pre">' + JSON.stringify(thisMarker.rawData, null, 2) + '</div>');

      if ($(window).width() < 992) { // For small screens, the details container will be on the second 'page'.
        $('html, body').animate({
          scrollTop: $('#earthquake-details').offset().top,
        });
      }
    });

    // The 'Set as My Location' button.
    $('.google-map-marker-content-more #set-as-my-location-' + markerIndex).on('click', function () {
      $('#my-location').val(thisMarker.position.lat() + ', ' + thisMarker.position.lng());

      if ($(window).width() < 992) { // For small screens, the form will be on the second 'page'.
        $('html, body').animate({
          scrollTop: $('#form-timezone-locale').offset().top,
        });
      }
    });
  }
}

/**
 * Adds a marker clusterer to manage the markers.
 * @param {google.maps.Marker[]} markers An array of Google Maps Markers.
 * @return {MarkerClusterer} The object of MarkerClusterer.
 */
function getMarkerCluster(markers) {
  var $ = jQuery;
  var result = null;

  $('#loader-message').text('Grouping earthquake markers...');

  if (markerClusterer) {
    markerClusterer.clearMarkers();
    markerClusterer.addMarkers(markers);
    result = markerClusterer;
  } else {
    result = new MarkerClusterer(map, markers, {
//            imagePath: 'https://developers.google.com/maps/documentation/javascript/examples/markerclusterer/m',
      imagePath: 'https://cdn.jsdelivr.net/npm/gmaps-marker-clusterer@1.2.2/images/m',
    });
  }

  hideLoader();

  return result;
}

/**
 * Logs a message in the debug console if the browser supports it.
 * @param {string} message The message needs to be logged.
 */
function logMessage(message) {
  if (typeof window.console !== 'undefined' && typeof window.console.log !== 'undefined') {
    window.console.log(message);
  }
}
