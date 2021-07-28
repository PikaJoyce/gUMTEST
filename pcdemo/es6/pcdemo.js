/* eslint-disable quotes */
/* eslint-disable no-console */
import createButton from '../../jsutilmodules/button.js';
import { createElement } from '../../jsutilmodules/createElement.js';
import { createLabeledCheckbox } from '../../jsutilmodules/createLabeledCheckbox.js';
import createLabeledStat from '../../jsutilmodules/labeledstat.js';
import { syntheticVideo }  from '../../jsutilmodules/syntheticvideo2.js';

function managePC({ parentDiv, myName }) {
  const thisPC = new RTCPeerConnection({ "iceServers": [], "sdpSemantics": "unified-plan" });
  window.testPCs[myName] = thisPC;
  const myDiv = createElement(parentDiv, { type: 'div', classNames: ['pc'] });
  const header = createElement(myDiv, { type: 'h2' });
  header.innerHTML = myName;
  const controlDiv = createElement(myDiv, { type: 'div', classNames: ['controls'] });
  const sdpDiv = createElement(myDiv, { type: 'div', classNames: ['sdpDiv'] });
  const signalingState = createLabeledStat(sdpDiv, 'SignalingState:', { className: 'signalingState', useValueToStyle: false });

  signalingState.setText(thisPC.signalingState);
  thisPC.addEventListener('signalingstatechange', () => {
    console.log(`${myName}: onsignalingstatechange`, thisPC.signalingState);
    signalingState.setText(thisPC.signalingState);
  });

  const connectionState = createLabeledStat(sdpDiv, 'ConnectionState:', { className: 'connectionState', useValueToStyle: false });
  connectionState.setText(thisPC.connectionState);
  thisPC.addEventListener('connectionstatechange', () => {
    console.log(`${myName}: connectionstatechange`, thisPC.connectionState);
    connectionState.setText(thisPC.connectionState);
  });

  const iceConnectionState = createLabeledStat(sdpDiv, 'iceState:', { className: 'iceState', useValueToStyle: false });
  iceConnectionState.setText(thisPC.iceConnectionState);
  thisPC.addEventListener('iceconnectionstatechange', () => {
    console.log(`${myName}: iceconnectionstatechange`, thisPC.iceConnectionState);
    iceConnectionState.setText(thisPC.iceConnectionState);
  });

  const sdpType = createElement(sdpDiv, { type: 'input' });
  const sdpOutput = createElement(sdpDiv, { type: 'textarea', classNames: ['sdp'] });

  function printTransceivers(message) {
    console.log(`${myName}:${message}`);
    thisPC.getTransceivers().forEach(({ mid, direction, currentDirection, stopped }) => {
      console.log({ mid, direction, currentDirection, stopped });
    });
  }

  createButton('print Transceivers', controlDiv, () => {
    printTransceivers('Current Transceivers');
  });

  const restartIce = createLabeledCheckbox({
    container: controlDiv,
    labelText: 'restartIce'
  });
  createButton('createOffer', controlDiv, async () => {
    console.log(`${myName}:createOffer: `);
    try {
      const offer = await thisPC.createOffer({
        iceRestart: restartIce.checked
      });
      sdpType.value = offer.type;
      sdpOutput.value = offer.sdp;
    } catch (e) {
      console.warn(`${myName}:createOffer failed: `, e);
    }
  });

  createButton('createAnswer', controlDiv, async () => {
    console.log(`${myName}:createAnswer`);
    try {
      const answer = await thisPC.createAnswer();
      sdpType.value = answer.type;
      sdpOutput.value = answer.sdp;
    } catch (e) {
      console.warn(`${myName}:createAnswer failed: `, e);
    }
  });

  createButton('setLocalDescription', controlDiv, async () => {
    try {
      const sdp = {
        type: sdpType.value,
        sdp: sdpOutput.value
      };
      console.log(`${myName}:setLocalDescription`);
      await thisPC.setLocalDescription(sdp);
    } catch (e) {
      console.warn(`${myName}:setLocalDescription failed`, e);
    }
  });

  createButton('Rollback', controlDiv, async () => {
    try {
      const sdp = {
        type: 'rollback',
      };
      console.log(`${myName}:rollback`);
      await thisPC.setLocalDescription(sdp);
    } catch (e) {
      console.warn(`${myName}:rollback failed`, e);
    }
  });

  let track = null;
  let trackSender = null;
  const trackButton = createButton('add Track', controlDiv, async () => {

    try {
      if (!track) {
        // eslint-disable-next-line require-atomic-updates
        let trackSynthetic  = await syntheticVideo({ width: 200, height: 200, word: myName });
        console.log('synthetic: ', trackSynthetic)
        track = await navigator.mediaDevices.getUserMedia({ video: {
          width: 200,
          height: 200
        } });
        console.log('gUM: ', track)
        playTrack(track);
      }
      if (!trackSender) {
        console.log(`${myName}:add Track`);
        trackSender = thisPC.addTrack(track);
      } else {
        console.log(`${myName}:remove Track`);
        thisPC.removeTrack(trackSender);
        trackSender = null;
      }
    } catch (e) {
      console.warn(`${myName}:add/remove track failed`, e);
    }
    trackButton.text(trackSender ? 'Remove Track' : 'Add Track');
  });

  const mediaDiv = createElement(myDiv, { type: 'div', classNames: ['localVideo'] });

  function playTrack(track) {
    const video = document.createElement("video");
    video.classList.add('remoteVideo');
    const stream = new MediaStream();
    stream.addTrack(track);
    video.srcObject = stream;
    video.autoplay = true;
    mediaDiv.appendChild(video);
    return video;
  }

  thisPC.ontrack = function(event) {
    console.log(`${myName}:ontrack`, event);
    const track = event.track;
    playTrack(track);
  };

  return {
    pc: thisPC,
    sdpOutput,
    sdpType,
    myName,
    setOther: other => {
      // we can apply ice candidates only after remote description is set.
      let queuedCandidates = [];
      other.pc.onsignalingstatechange = function() {
        if (other.pc.remoteDescription !== null) {
          queuedCandidates.forEach(candidate => {
            try {
              other.pc.addIceCandidate(candidate);
            } catch (e) {
              console.warn(`${other.myName}: failed to addIceCandidate`, event.candidate);
            }
          });
          queuedCandidates = [];
        }
      };
      thisPC.onicecandidate = function(event) {
        if (event.candidate) {
          if (other.pc.remoteDescription !== null) {
            try {
              console.log(`${other.myName}: addIceCandidate`, event.candidate);
            } catch (e) {
              console.warn(`${other.myName}: failed to addIceCandidate`, event.candidate);
            }
          } else {
            console.log(`${other.myName}: queued ice candidate`);
            queuedCandidates.push(event.candidate);
          }
        }
      };
      createButton('setRemoteDescription', controlDiv, async () => {
        console.log(`${myName}: setRemoteDescription`);
        try {
          const sdp = {
            type: other.sdpType.value,
            sdp: other.sdpOutput.value
          };
          await thisPC.setRemoteDescription(sdp);
        } catch (e) {
          console.warn(`${myName}:failed to setRemoteDescription: `, e.message);
        }
      });
    }
  };
}

export function main(containerDiv) {
  const demoButton = createButton('Demo', containerDiv, () => {
    console.log('Started Demo!');
    window.testPCs = {};
    const alicePCManager = managePC({ myName: 'Alice', parentDiv: containerDiv });
    const bobPCManager = managePC({ myName: 'Bob', parentDiv: containerDiv });
    alicePCManager.setOther(bobPCManager);
    bobPCManager.setOther(alicePCManager);
    demoButton.btn.remove();
  });
}
