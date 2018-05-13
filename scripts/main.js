/**
 * @createdOn 13/05/2018, 1:35:12 PM
 * @author Marty Zhang <marty8zhang@gmail.com>
 * @version 0.9.201505140942
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

  if ($('#my-location').val().trim() !== '') {
    var tempLocation = $('#my-location').val().trim();

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
  if (currentInfoWindow) {
    currentInfoWindow.close();
  }

  jQuery.ajax({
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

              var markers = getMarkers(data.features);

              markerClusterer = getMarkerCluster(markers);
            }
          });
}

/*
 * Resets/initialises a marker for My Position on the map, draws a circle around it (if there is a selected radius), re-centers the map, and sets the proper zoom level for the map.
 */
function resetPositionMarker() {
  if (currentLocationMarker) {
    currentLocationMarker.setPosition(currentLocation);
  } else {
    currentLocationMarker = new google.maps.Marker({
      position: currentLocation,
      map: map,
      icon: {
        url: 'https://chart.googleapis.com/chart?chst=d_map_pin_icon&chld=star|00F',
        scaledSize: new google.maps.Size(26, 42)
      },
    });
  }

  if (selectedRadius) {
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
 * Identifies the location-related error and displays the error message.
 * @param {type} error
 */
function showLocationError(error) {
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

  /* Development Note: It's not ideal to put the below code here. However, doing this can guarantee the code being executed whenever there is a location related error, which also represents an exit point of the whole map initialising process. */
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
  var result = [];

  $('#number-of-results-in-range').empty();

  if (rawLocationData && rawLocationData.constructor === Array && rawLocationData.length) {
    for (i = 0; i < rawLocationData.length; i++) {
      var location = rawLocationData[i];
      var latLng = new google.maps.LatLng(location.geometry.coordinates[1], location.geometry.coordinates[0]);

      if (selectedRadius == '' || Math.ceil(google.maps.geometry.spherical.computeDistanceBetween(currentLocation, latLng) / 1000) <= selectedRadius) { // Not worldwide or within the selected radius. Development Note: computeDistanceBetween() returns a value in metres.
//            var locationTime = new Date(location.properties.time); // The raw value is the number of milliseconds since the epoch.
        var locationTime = moment(location.properties.time); // The raw value is the number of milliseconds since the epoch.

        var markerContent = '<h3 class="google-map-marker-title">' + location.properties.place + '</h3>';
        markerContent += '<div class="google-map-marker-content">';
//            markerContent += '<p><strong>Time:</strong> ' + locationTime.toLocaleString('en-AU') + '</p>';
        markerContent += '<p><strong>Time:</strong> ' + locationTime.format('LLLL Z') + '</p>';
        markerContent += '<p><strong>Latitude:</strong> ' + location.geometry.coordinates[1] + '<br><strong>Longitude:</strong> ' + location.geometry.coordinates[0] + '<br><strong>Depth:</strong> ' + location.geometry.coordinates[2] + ' km</p>';
        markerContent += '<p><strong>Magnitude:</strong> ' + location.properties.mag + '</p>';
        markerContent += '</div><\!-- .google-map-marker-content --\>';
        markerContent += '<div class="google-map-marker-content-more"><p class="buttons"><button class="btn-show-details btn btn-default">Show Details</button><button id="btn-set-as-my-location" class="btn btn-default">Set as My Location</button></p></div>';

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

        google.maps.event.addListener(marker, 'click', function () {
          var thisMarker = this;

          $('#earthquake-details').empty();

          if (currentInfoWindow) {
            currentInfoWindow.close();
          }
          this.infoWindow.open(map, this);
          currentInfoWindow = this.infoWindow;

          // To-do: Shouldn't do this inside the map event?
          $('.google-map-marker-content-more .btn-show-details').on('click', function () {
            $('#earthquake-details').html('<h4>Earthquake Detail:</h4><div class="pre">' + JSON.stringify(thisMarker.rawData, null, 2) + '</div>');

            if ($(window).width() < 992) {
              $('html, body').animate({
                scrollTop: $('#right-sidebar').offset().top,
              });
            }
          });
        });

        // To-do: #btn-set-as-my-location

        result.push(marker);
      }
    }

    $('#number-of-results-in-range').text(result.length + " earthquake(s) detected in the selected area within the last 24 hours.");
  }

  return result;
}

/**
 * Adds a marker clusterer to manage the markers.
 * @param {google.maps.Marker[]} markers An array of Google Maps Markers.
 * @return {MarkerClusterer} The object of MarkerClusterer.
 */
function getMarkerCluster(markers) {
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