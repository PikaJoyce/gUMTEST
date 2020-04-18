/* eslint-disable require-atomic-updates */
/* eslint-disable no-console */
/* eslint-disable quotes */
'use strict';

// const Waveform = require('../../examples/util/waveform');
// var Video = require('twilio-video');
import { Waveform } from './waveform.js';
export function demo(Video) {
  const remoteParticipantsContainer = document.getElementById('remote-participants');
  const btnJoin = document.getElementById('button-join');
  const btnLeave =  document.getElementById('button-leave');
  const logDiv = document.getElementById('log');

  const localAudioTrackContainer = document.getElementById('audioTrack');
  const localVideoTrackContainer = document.getElementById('videoTrack');
  const btnPreviewAudio = document.getElementById('button-preview-audio');
  const btnPreviewVideo = document.getElementById('button-preview-video');
  const localIdentity  = document.getElementById('localIdentity');
  const autoPublish  = document.getElementById('autoPublish');
  const autoAttach  = document.getElementById('autoAttach');
  const autoJoin  = document.getElementById('autoJoin');
  const roomName = document.getElementById('room-name');

  // process parameters.
  var urlParams = new URLSearchParams(window.location.search);
  let token = urlParams.get('token');
  if (!token && location.host === "makarandp0.github.io") {
    createElement(document.body, { type: 'h1', classNames: ['badError'] }).textContent = 'token is very required parameter';
    return;
  }

  roomName.value = urlParams.get('room');
  autoAttach.checked = !urlParams.has('noAutoAttach');
  autoPublish.checked = !urlParams.has('noAutoPublish');
  autoJoin.checked = urlParams.has('room') && urlParams.has('autoJoin');

  // remove token from the url params.
  urlParams.delete('token');
  const { protocol, host, pathname } = window.location;
  console.log({ protocol, host, pathname });
  window.history.replaceState(null, '', window.encodeURI(`${protocol}//${host}${pathname}?${urlParams}`));

  var activeRoom;
  const localTracks = [];

  /**
  * Get the Room credentials from the server.
  * @param {string} [identity] identity to use, if not specified server generates random one.
  * @returns {Promise<{identity: string, token: string}>}
  */
  async function getRoomCredentials(identity) {
    const tokenUrl = '/token' + (identity ? '?identity=' + identity : '');
    const response = await fetch(tokenUrl);
    return response.json();
  }

  const roomChangeCallbacks = [];
  class RoomChanged {
    register(callback) {
      roomChangeCallbacks.push(callback);
      callback(activeRoom);
    }

    unregister(callback) {
      var index = roomChangeCallbacks.indexOf(callback);
      if (index > -1) {
        roomChangeCallbacks.splice(index, 1);
      }
    }

    emitRoomChange(room) {
      window.room = activeRoom = room;
      roomChangeCallbacks.forEach(callback => callback(room));
    }

    get room() {
      return activeRoom;
    }
  }

  const roomChangeMonitor = new RoomChanged();

  /**
 * Attach the AudioTrack to the HTMLAudioElement and start the Waveform.
 */
  function attachAudioTrack(track, container) {
    var audioElement = container.appendChild(track.attach());
    const waveform = new Waveform();
    waveform.setStream(audioElement.srcObject);
    const canvasContainer = createDiv(container, 'canvasContainer');
    canvasContainer.appendChild(waveform.element);
    return audioElement;
  }

  function createElement(container, { type, id, classNames }) {
    const el = document.createElement(type);
    if (id) {
      el.id = id;
    }
    if (classNames) {
      el.classList.add(...classNames);
    }

    container.appendChild(el);
    return el;
  }

  function createDiv(container, divClass, id) {
    return createElement(container, { type: 'div', classNames: [divClass], id });
  }

  function getChildDiv(container, divClass) {
    return container.querySelector('.' + divClass) || createDiv(container, divClass);
  }

  function createButton(text, container, onClick) {
    const btn = createElement(container, { type: 'button', classNames: ['btn', 'btn-outline-primary', 'btn-sm'] });
    btn.innerHTML = text;
    btn.onclick = onClick;
    return {
      btn,
      show: visible => { btn.style.display = visible ? 'inline-block' : 'none'; },
      text: newText => { btn.innerHTML = newText; },
      click: () => onClick()
    };
  }

  // styleMap uses the values to decide the style.
  function createLabeledStat(container, label, { id, className, useValueToStyle = false }) {
    const el = createElement(container, { type: 'p', id, classNames: [className, 'labeledStat'] });
    let lastText = null;
    return {
      setText: text => {
        if (useValueToStyle && lastText !== null) {
          el.classList.remove(`${className}_${lastText}`);
        }
        el.textContent = label + ': ' + text;
        if (useValueToStyle) {
          el.classList.add(`${className}_${text}`);
          lastText = text;
        }
      }
    };
  }

  function createTrackStats(track, container) {
    var statsContainer = createDiv(container, 'trackStats');

    const readyState = createLabeledStat(statsContainer, 'mediaStreamTrack.readyState', { className: 'readyState', useValueToStyle: true });
    const enabled = createLabeledStat(statsContainer, 'mediaStreamTrack.enabled', { className: 'enabled', useValueToStyle: true });
    const muted = createLabeledStat(statsContainer, 'mediaStreamTrack.muted', { className: 'muted', useValueToStyle: true });
    const started = createLabeledStat(statsContainer, 'Track.started', { className: 'started', useValueToStyle: true });
    const trackEnabled = createLabeledStat(statsContainer, 'Track.enabled', { className: 'enabled', useValueToStyle: true });
    const bytes = createLabeledStat(statsContainer, 'bytes', { className: 'bytes', useValueToStyle: true });
    bytes.setText('0');

    track.on('disabled', () => updateStats('disabled'));
    track.on('enabled', () => updateStats('enabled'));
    track.on('stopped', () => updateStats('stopped'));
    track.on('started', () => updateStats('started'));
    track.mediaStreamTrack.addEventListener('ended', () => updateStats('ended'));
    track.mediaStreamTrack.addEventListener('mute', () => updateStats('mute'));
    track.mediaStreamTrack.addEventListener('unmute', () => updateStats('unmute'));

    function updateStats(event, byteUpdate) {
      if (event === 'bytes') {
        bytes.setText(byteUpdate);
      } else {
        log(`${track.sid || track.id} got: ${event}`);
        readyState.setText(track.mediaStreamTrack.readyState);
        enabled.setText(track.mediaStreamTrack.enabled);
        started.setText(track.isStarted);
        muted.setText(track.mediaStreamTrack.muted);
        trackEnabled.setText(track.isEnabled);
      }
    }

    return updateStats;
  }

  const trackStatUpdater = new Map();
  function updateTrackStats({ trackId, trackSid, bytesSent, bytesReceived, trackType }) {
    const isRemote = trackType === 'remoteVideoTrackStats' || trackType ===  'remoteAudioTrackStats';
    trackStatUpdater.forEach((updateStats, track) => {
      if (track.sid === trackSid || track.id === trackId) {
        updateStats('bytes', isRemote ? bytesReceived : bytesSent);
      }
    });
  }

  // Attach the Track to the DOM.
  function renderTrack(track, container, isLocal) {
    console.log(`track.sid:${track.sid}, track.id:${track.id}`);
    const trackContainerId = isLocal ? track.id : track.sid;
    const trackContainer = createDiv(container, track.kind + 'Container', trackContainerId);
    const updateStats = createTrackStats(track, trackContainer, isLocal);
    trackStatUpdater.set(track, updateStats);

    const controlContainer = createDiv(trackContainer, 'trackControls');

    if (isLocal) {
      localTracks.push(track);

      createButton('disable', controlContainer, () => track.disable());
      createButton('enable', controlContainer, () => track.enable());
      createButton('stop', controlContainer, () => track.stop());

      let trackPublication = null;
      let unPublishBtn = null;
      const publishBtn = createButton('publish', controlContainer, async () => {
        trackPublication = await activeRoom.localParticipant.publishTrack(track);
        publishBtn.show(!trackPublication);
        unPublishBtn.show(!!trackPublication);
      });

      unPublishBtn = createButton('unpublish', controlContainer, () => {
        if (trackPublication) {
          trackPublication.unpublish();
          trackPublication = null;
          publishBtn.show(!trackPublication);
          unPublishBtn.show(!!trackPublication);
        }
      });

      const onRoomChanged = room => {
        console.warn('makarand: roomChangeMonitor fired:', room);
        if (room) {
          trackPublication = [...room.localParticipant.tracks.values()].find(trackPub => trackPub.track === track);
        }
        publishBtn.show(room && !trackPublication);
        unPublishBtn.show(room && !!trackPublication);
      };

      // show hide publish button on room joining/leaving.
      roomChangeMonitor.register(onRoomChanged);

      // if autoPublish and room exits, publish the track
      if (roomChangeMonitor.room && autoPublish.checked) {
        publishBtn.click();
      }

      createButton('close', controlContainer, () => {
        var index = localTracks.indexOf(track);
        if (index > -1) {
          localTracks.splice(index, 1);
        }
        trackContainer.remove();
        roomChangeMonitor.unregister(onRoomChanged);
      });
    }

    createButton('update', controlContainer, () => updateStats('update'));

    let mediaControls = null;
    const attachDetachBtn = createButton('attach', controlContainer, () => {
      if (mediaControls) {
      // track is already attached.
        track.detach().forEach(el => el.remove());
        mediaControls.remove();
        mediaControls = null;
        attachDetachBtn.text('attach');
      } else {
      // track is detached.
        mediaControls = createDiv(trackContainer, 'mediaControls');
        let audioVideoElement = null;
        if (track.kind === 'audio') {
          audioVideoElement = attachAudioTrack(track, mediaControls);
        } else {
          audioVideoElement = track.attach();
          mediaControls.appendChild(audioVideoElement);
        }
        createButton('pause', mediaControls, () => audioVideoElement.pause());
        createButton('play', mediaControls, () => audioVideoElement.play());
        attachDetachBtn.text('detach');
      }
    });
    if (autoAttach.checked) {
      attachDetachBtn.click();
    }
    updateStats('initial');
  }

  // Detach given track from the DOM.
  function detachTrack(track, container) {
    const trackContainer = document.getElementById(track.sid);
    track.detach().forEach(function(element) {
      element.remove();
    });
    trackStatUpdater.delete(track);
    container.removeChild(trackContainer);
  }

  // Attach array of Tracks to the DOM.
  function renderTracks(tracks, container, isLocal) {
    tracks.forEach(track => renderTrack(track, container, isLocal));
  }

  // A new RemoteTrack was published to the Room.
  function trackPublished(publication, container) {
    if (publication.isSubscribed) {
      renderTrack(publication.track, container);
    } else {
      console.log('not subscribed:', publication);
    }
    publication.on('subscribed', function(track) {
      log('Subscribed to ' + publication.kind + ' track');
      renderTrack(track, container);
    });
    publication.on('unsubscribed', track => detachTrack(track, container));
  }

  // A RemoteTrack was unpublished from the Room.
  function trackUnpublished(publication) {
    log(publication.kind + ' track was unpublished.');
  }

  // A new RemoteParticipant joined the Room
  function participantConnected(participant, container, isLocal = false) {
    let selfContainer = createDiv(container, 'participantDiv', `participantContainer-${participant.identity}`);

    const name = createElement(selfContainer, { type: 'h6', classNames: ['participantName'] });
    name.innerHTML = participant.identity;

    const participantMediaDiv = getChildDiv(selfContainer, 'participantMediaDiv');

    if (isLocal) {
      renderTracks(getTracks(participant), participantMediaDiv, isLocal);
    } else {
      participant.tracks.forEach(publication => trackPublished(publication, participantMediaDiv));
      participant.on('trackPublished', publication => trackPublished(publication, participantMediaDiv));
      participant.on('trackUnpublished', trackUnpublished);
    }
  }

  function participantDisconnected(participant) {
    const container = document.getElementById(`participantContainer-${participant.identity}`);
    var tracks = getTracks(participant);
    tracks.forEach(track => detachTrack(track, container));
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }

  // When we are about to transition away from this page, disconnect
  // from the room, if joined.
  window.addEventListener('beforeunload', leaveRoomIfJoined);

  function joinRoom(token) {
    var roomName = document.getElementById('room-name').value;
    if (!roomName) {
    // eslint-disable-next-line no-alert
      alert('Please enter a room name.');
      return;
    }

    log(`Joining room ${roomName} ${autoPublish.checked ? "with" : "without"} ${localTracks.length} localTracks`);
    var connectOptions = {
      tracks: autoPublish.checked ? localTracks : [],
      name: roomName,
      logLevel: 'debug'
    };
    // Join the Room with the token from the server and the
    // LocalParticipant's Tracks.

    Video.connect(token, connectOptions).then(roomJoined).catch(error => {
      log('Could not connect to Twilio: ' + error.message);
    });
  }

  function updateControls(connected) {
    localIdentity.innerHTML = connected ? activeRoom.localParticipant.identity : 'Not joined yet';
    document.getElementById('room-controls').style.display = 'block';

    [btnLeave].forEach(btn => {
      btn.disabled = connected === false;
    });

    [btnJoin].forEach(btn => {
      btn.disabled = connected === true;
    });

    [btnPreviewAudio, btnPreviewVideo].forEach(btn => {
      btn.disabled = false;
    });
  }

  (async function main() {
    updateControls(false);
    roomChangeMonitor.emitRoomChange(null);
    if (!token) {
      console.log('getting token');
      token = (await getRoomCredentials()).token;
    } else {
      console.log('Using Token:', token);
    }

    btnLeave.onclick = function() {
      log('Leaving room...');
      activeRoom.disconnect();
      roomChangeMonitor.emitRoomChange(null);
    };

    btnJoin.onclick = () => joinRoom(token);
    if (autoJoin.checked) {
      btnJoin.onclick();
    }
  }());


  // Get the Participant's Tracks.
  function getTracks(participant) {
    return Array.from(participant.tracks.values()).filter(function(publication) {
      return publication.track;
    }).map(function(publication) {
      return publication.track;
    });
  }

  // Successfully connected!
  function roomJoined(room) {
    roomChangeMonitor.emitRoomChange(room);
    updateControls(true);

    log("Joined as '" + activeRoom.localParticipant.identity + "'");
    room.participants.forEach(function(participant) {
      log("Already in Room: '" + participant.identity + "'");
      participantConnected(participant, remoteParticipantsContainer);
    });

    // When a Participant joins the Room, log the event.
    room.on('participantConnected', function(participant) {
      log("Joining: '" + participant.identity + "'");
      participantConnected(participant, remoteParticipantsContainer);
    });

    // When a Participant leaves the Room, detach its Tracks.
    room.on('participantDisconnected', function(participant) {
      log("RemoteParticipant '" + participant.identity + "' left the room");
      participantDisconnected(participant);
    });

    var statUpdater = setInterval(async () => {
      const statReports = await room.getStats();
      statReports.forEach(statReport => {
        ['remoteVideoTrackStats', 'remoteAudioTrackStats', 'localAudioTrackStats', 'localVideoTrackStats'].forEach(trackType => {
          statReport[trackType].forEach(trackStats => updateTrackStats({ ...trackStats, trackType }));
        });
      });
    }, 100);

    // Once the LocalParticipant leaves the room, detach the Tracks
    // of all Participants, including that of the LocalParticipant.
    room.on('disconnected', function() {
      log('Left');
      clearInterval(statUpdater);
      room.participants.forEach(participantDisconnected);
      activeRoom = null;
      updateControls(false);
    });
  }

  btnPreviewAudio.onclick = async () => {
  // eslint-disable-next-line require-atomic-updates
    const localAudioTrack = await Video.createLocalAudioTrack();
    renderTrack(localAudioTrack, localAudioTrackContainer, true);
    console.log('localTracks.length:', localTracks.length);
  };

  btnPreviewVideo.onclick = async () => {
    const localVideoTrack = await Video.createLocalVideoTrack();
    renderTrack(localVideoTrack, localVideoTrackContainer, true);
    console.log('localTracks.length:', localTracks.length);
  };

  function log(message) {
    console.log('QuickStart: ' + message);
    logDiv.innerHTML += '<p>&gt;&nbsp;' + message + '</p>';
    logDiv.scrollTop = logDiv.scrollHeight;
  }

  // Leave Room.
  function leaveRoomIfJoined() {
    if (activeRoom) {
      activeRoom.disconnect();
    }
    roomChangeMonitor.emitRoomChange(null);
  }
}
