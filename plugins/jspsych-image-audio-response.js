/**
 * jspsych-image-audio-response
 * Matt Jaquiery, Feb 2018
 *
 * plugin for displaying a stimulus and getting an audio response
 *
 * documentation: docs.jspsych.org
 *
 **/

jsPsych.plugins["image-audio-response"] = (function() {

    let plugin = {};

    plugin.info = {
        name: 'image-audio-response',
        description: 'Present an image and retrieve an audio response',
        parameters: {
            stimulus: {
                type: jsPsych.plugins.parameterType.IMAGE,
                pretty_name: 'Stimulus',
                default: undefined,
                description: 'The image to be displayed'
            },
            buffer_length: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: 'Buffer length',
                default: 4000,
                description: 'Length of the audio buffer.'
            },
            postprocessing: {
                type: jsPsych.plugins.parameterType.FUNCTION,
                pretty_name: 'Postprocessing function',
                default: function(chunks) {return new Promise(
                    function(resolve) {resolve(chunks)}
                    )},
                description: 'Function to execute on the audio data prior to saving. '+
                    'Passed the audio data and the return value is saved in the '+
                    'response object. This can be used for saving a file, and generating an id '+
                    'which relates the file to the trial data in the trial response.'
            },
            allow_playback: {
                type: jsPsych.plugins.parameterType.BOOL,
                pretty_name: 'Allow playback',
                default: true,
                description: 'Whether to allow the participant to play back their '+
                'recording and re-record if unhappy.'
            },
            recording_light: {
                type: jsPsych.plugins.parameterType.HTML_STRING,
                pretty_name: 'Recording light',
                default: '<div id="jspsych-image-audio-response-light" '+
                    'style="border: 2px solid darkred; background-color: darkred; '+
                    'width: 50px; height: 50px; border-radius: 50px; margin: 20px auto; '+
                    'display: block;"></div>',
                description: 'HTML to display while recording is in progress.'
            },
            recording_light_off: {
                type: jsPsych.plugins.parameterType.HTML_STRING,
                pretty_name: 'Recording light (off state)',
                default: '<div id="jspsych-image-audio-response-light" '+
                'style="border: 2px solid darkred; background-color: inherit; '+
                'width: 50px; height: 50px; border-radius: 50px; margin: 20px auto; '+
                'display: block;"></div>',
                description: 'HTML to display while recording is not in progress.'
            },
            prompt: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: 'Prompt',
                default: null,
                description: 'Any content here will be displayed under the button.'
            },
            stimulus_duration: {
                type: jsPsych.plugins.parameterType.INT,
                pretty_name: 'Stimulus duration',
                default: null,
                description: 'How long to show the stimulus.'
            },
            margin_vertical: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: 'Margin vertical',
                default: '0px',
                description: 'The vertical margin of the button.'
            },
            margin_horizontal: {
                type: jsPsych.plugins.parameterType.STRING,
                pretty_name: 'Margin horizontal',
                default: '8px',
                description: 'The horizontal margin of the button.'
            },
            response_ends_trial: {
                type: jsPsych.plugins.parameterType.BOOL,
                pretty_name: 'Response ends trial',
                default: false,
                description: 'If true, then trial will end when user responds.'
            },
            wait_for_mic_approval: {
                type: jsPsych.plugins.parameterType.BOOL,
                pretty_name: 'Wait for mic approval',
                default: false,
                description: 'If true, the trial will not start until the participant approves the browser mic request.'
            }
        }
    };

    plugin.trial = function(display_element, trial) {

        if(typeof trial.stimulus === 'undefined'){
            console.error('Required parameter "stimulus" missing in image-audio-response');
        }
        if(typeof trial.postprocessing === 'undefined'){
            console.error('Required parameter "postprocessing" missing in image-audio-response');
        }

        let playbackElements = [];
        // store response
        let response = {
            rt: null,
            audio_data: null
        };
        let recorder = null;
        let start_time = null;

        // add stimulus
        let html = '<img src="'+trial.stimulus+'" id="jspsych-image-audio-response-stimulus"/>';

        // add prompt if there is one
        if (trial.prompt !== null) {
            html += trial.prompt;
        }

        // add recording off light
        html += '<div id="jspsych-image-audio-response-recording-container">'+trial.recording_light_off+'</div>';

        // add audio element container with hidden audio element
        html += '<div id="jspsych-image-audio-response-audio-container"><audio id="jspsych-image-audio-response-audio" controls style="visibility:hidden;"></audio></div>';

        // add button element with hidden buttons
        html += '<div id="jspsych-image-audio-response-buttons"><button id="jspsych-image-audio-response-okay" class="jspsych-audio-response-button jspsych-btn" style="display: inline-block; margin:'+trial.margin_vertical+' '+trial.margin_horizontal+'; visibility:hidden;">Okay</button><button id="jspsych-image-audio-response-rerecord" class="jspsych-audio-response-button jspsych-btn" style="display: inline-block; margin:'+trial.margin_vertical+' '+trial.margin_horizontal+'; visibility:hidden;">Rerecord</button></div>';

        function start_trial() {
            display_element.innerHTML = html;
            document.querySelector('#jspsych-image-audio-response-okay').addEventListener('click', end_trial);
            document.querySelector('#jspsych-image-audio-response-rerecord').addEventListener('click', start_recording);
            // Add visual indicators to let people know we're recording
            document.querySelector('#jspsych-image-audio-response-recording-container').innerHTML = trial.recording_light;
            // trial start time
            start_time = performance.now();
            // set timer to hide image if stimulus duration is set
            if (trial.stimulus_duration !== null) {
                jsPsych.pluginAPI.setTimeout(function() {
                    display_element.querySelector('#jspsych-image-audio-response-stimulus').style.visibility = 'hidden';
                }, trial.stimulus_duration);
            }
            if (!trial.wait_for_mic_approval) {
                start_recording();
            }
        }

        // audio element processing
        function start_recording() {
            // hide existing playback elements
            playbackElements.forEach(function (id) {
                let element = document.getElementById(id);
                element.style.visibility = 'hidden';
            });
            navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(process_audio);
            if (!trial.wait_for_mic_approval) {
                // Add visual indicators to let people know we're recording
                document.querySelector('#jspsych-image-audio-response-recording-container').innerHTML = trial.recording_light;
            }
        }
        
        // function to handle responses by the subject
        function process_audio(stream) {

            if (trial.wait_for_mic_approval) {
                if (start_time === null) {
                    start_trial();
                } else {
                    document.querySelector('#jspsych-image-audio-response-recording-container').innerHTML = trial.recording_light;
                }
            } 

            // This code largely thanks to skyllo at
            // http://air.ghost.io/recording-to-an-audio-file-using-html5-and-js/

            // store streaming data chunks in array
            const chunks = [];
            // create media recorder instance to initialize recording
            // Note: the MediaRecorder function is not supported in Safari or Edge
            recorder = new MediaRecorder(stream);
            recorder.data = [];
            recorder.wrapUp = false;
            recorder.ondataavailable = function(e) {
                // add stream data to chunks
                chunks.push(e.data);
                if (recorder.wrapUp) {
                    if (typeof trial.postprocessing !== 'undefined') {
                        trial.postprocessing(chunks)
                            .then(function(processedData) {
                                onRecordingFinish(processedData);
                            });
                    } else {
                        // should never fire - trial.postprocessing is mandatory
                        onRecordingFinish(chunks);
                    }
                }
            };

            // start recording with 1 second time between receiving 'ondataavailable' events
            recorder.start(1000);
            // setTimeout to stop recording after 4 seconds
            setTimeout(function() {
                // this will trigger one final 'ondataavailable' event and set recorder state to 'inactive'
                recorder.stop();
                recorder.wrapUp = true;
            }, trial.buffer_length);
        }

        function showPlaybackTools(data) {
            // Audio Player
            let playerDiv = display_element.querySelector('#jspsych-image-audio-response-audio-container');
            let url;
            if (data instanceof Blob) {
                const blob = new Blob(data, { type: 'audio/webm' });
                url = (URL.createObjectURL(blob));
            } else {
                url = data;
            }
            let player = playerDiv.querySelector('#jspsych-image-audio-response-audio');
            player.src = url;
            player.style.visibility = "visible";
            // Okay/rerecord buttons
            let buttonDiv = document.querySelector('#jspsych-image-audio-response-buttons');
            let okay = buttonDiv.querySelector('#jspsych-image-audio-response-okay');
            let rerecord = buttonDiv.querySelector('#jspsych-image-audio-response-rerecord');
            okay.style.visibility = 'visible';
            rerecord.style.visibility = 'visible';
            // Save ids of things we want to hide later:
            playbackElements = [player.id, okay.id, rerecord.id];
        }

        function onRecordingFinish(data) {
            // switch to the off visual indicator
            let light = document.querySelector('#jspsych-image-audio-response-recording-container');
            if (light !== null)
                light.innerHTML = trial.recording_light_off;
            // measure rt
            let end_time = performance.now();
            let rt = end_time - start_time;
            response.audio_data = data.str;
            response.audio_url = data.url;
            response.rt = rt;

            if (trial.response_ends_trial) {
                end_trial();
            } else if (trial.allow_playback) {  // only allow playback if response doesn't end trial
                showPlaybackTools(response.audio_data);
            } else { 
                // fallback in case response_ends_trial and allow_playback are both false, 
                // which would mean the trial never ends
                end_trial();
            }
        }

        // function to end trial when it is time
        function end_trial() {
            // kill any remaining setTimeout handlers
            jsPsych.pluginAPI.clearAllTimeouts();

            // gather the data to store for the trial
            let trial_data = {
                "rt": response.rt,
                "stimulus": trial.stimulus,
                "audio_data": response.audio_data
            };

            // clear the display
            display_element.innerHTML = '';

            // move on to the next trial
            jsPsych.finishTrial(trial_data);
        }

        if (trial.wait_for_mic_approval) {
            start_recording();
        } else {
            start_trial();
        }

    };

    return plugin;
})();
