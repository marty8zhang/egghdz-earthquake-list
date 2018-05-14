/**
 * @createdOn 13/05/2018, 1:35:12 PM
 * @author Marty Zhang <marty8zhang@gmail.com>
 * @version 0.9.201805141650
 */
/*
 * To-do:
 *   - Formalise error messages.
 *   - Feed selector.
 */
var remoteURL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
// Google Maps related variables.
var defaultMapZoom = 2;
var defaultMapCenter = {
  lat: -28.024,
  lng: 140.887
};
var currentInfoWindow = null;
var markerClusterer = null;
var map = new google.maps.Map(document.getElementById('earthquake-map'), {
  zoom: defaultMapZoom,
  center: defaultMapCenter,
  scaleControl: true,
});
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
  $('#form-timezone-locale').on('submit', function (e) {
    /* Development Note: This is the correct place, instead of listening to the button click event, to prevent the form from being submitted. */
    e.preventDefault();
  });

  // Initialises the Reset button.
  $('#btn-update-map').on('click', function () {
    $('#loader-wrapper').removeClass('hidden');

    $('#btn-back-to-map').trigger('click');

    resetLocaleTimezone(); // This needs to be called before resetMap().

    resetLocation(resetMap);

    $('#earthquake-details').empty();
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
function resetLocaleTimezone() {
  var $ = jQuery;
  var timezoneOptions = '';
  var localeOptions = '';

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
        if (geoStatus === google.maps.GeocoderStatus.OK) {
          currentLocation = geocoderResult[0].geometry.location;
          $('#my-location').val(geocoderResult[0].formatted_address);

          resetPositionMarker();

          if (callback) {
            callback();
          }
        } else {
          showLocationError({
            code: 1001, // Makes up our own error code to comply with the method signature.
            message: "Geocode was not successful for the following reason: " + geoStatus,
          });
        }
      });
    }
  } else { // Tries to auto detect the visitor's location.
    // Tries HTML5 geolocation.
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (position) {
        currentLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        $('#my-location').val(position.coords.latitude + ', ' + position.coords.longitude);

        resetPositionMarker();

        if (callback) {
          callback();
        }
      }, showLocationError);
    } else {
      showLocationError({
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

  if (currentInfoWindow) {
    currentInfoWindow.close();
  }

  $.ajax({
    url: remoteURL,
    dataType: 'json',
  })
          .fail(function () {
            logMessage('An error occurred. It is most likely that the server of USGS\'s Earthquake Hazards Program is not available at the moment.');

            $('#loader-wrapper').addClass('hidden');
          })
          .done(function (data) {
            if (!isRawDataValid(data)) {
              logMessage('An error occurred. The returned data from the server of USGS\'s Earthquake Hazards Program is invalid.');

              $('#loader-wrapper').addClass('hidden');
            } else {
//              logMessage(data.features);

              markers = getMarkers(data.features);

              markerClusterer = getMarkerCluster(markers);
            }
          });
}

/*
 * Resets/initialises a marker for My Position on the map, draws a circle around it (if there is a selected radius), re-centers the map, and sets the proper zoom level for the map.
 */
function resetPositionMarker() {
  var markerOptions = {
    position: currentLocation,
    map: map,
    infoWindow: null, // In case there is a previous binding.
//    zIndex: 9999999999,
    icon: {
      path: google.maps.SymbolPath.CIRCLE,
      strokeWeight: 2,
      strokeColor: '#FFF',
      fillColor: '#00F',
      fillOpacity: 1,
      scale: 6,
    },
  };

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

  map.setCenter(currentLocation);
  map.setZoom(determineMapZoom());
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
 * @param {type} error
 */
function showLocationError(error) {
  var $ = jQuery;

  switch (error.code) {
    case error.PERMISSION_DENIED:
      logMessage("User denied the request for Geolocation.");
      break;

    case error.POSITION_UNAVAILABLE:
      logMessage("Location information is unavailable.");
      break;

    case error.TIMEOUT:
      logMessage("The request to get user location timed out.");
      break;

    case error.UNKNOWN_ERROR:
      logMessage("An unknown error occurred.");
      break;

    default:
      logMessage(error.message);
  }

  /* Development Note: It might not be a good practise to put the below code here. However, doing this can guarantee the code being executed whenever there is a location related error, which also represents an exit point of the whole map initialising process. */
  $('#loader-wrapper').addClass('hidden');
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
 * @return {boolean} Returns true if the raw data returned by the server of USGS\'s Earthquake Hazards Program is valid; or false otherwise.
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

  $('#number-of-results-in-range').empty();

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
          maxWidth: 700,
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

    $('#number-of-results-in-range').text(result.length + " earthquake(s) detected in the selected area within the last 24 hours.");
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
    thisMarker.infoWindow.open(map, thisMarker);
    currentInfoWindow = thisMarker.infoWindow;

    // The 'Show Details' button.
    $('.google-map-marker-content-more #show-details-' + markerIndex).on('click', function () {
      $('#earthquake-details').html('<h4>Earthquake Detail:</h4><div class="pre">' + JSON.stringify(thisMarker.rawData, null, 2) + '</div>');

      if ($(window).width() < 992) { // For small screens, the details container will be on the second 'page'.
        $('html, body').animate({
          scrollTop: $('#right-sidebar').offset().top,
        });
      }
    });

    // The 'Set as My Location' button.
    $('.google-map-marker-content-more #set-as-my-location-' + markerIndex).on('click', function () {
      $('#my-location').val(thisMarker.position.lat() + ', ' + thisMarker.position.lng());
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

  $('#loader-wrapper').addClass('hidden');

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