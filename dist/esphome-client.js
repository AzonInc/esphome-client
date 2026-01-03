/* Copyright(C) 2017-2025, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * esphome-client.ts: ESPHome native API client with Noise encryption support.
 */
import { createESPHomeHandshake } from "./crypto-noise.js";
import { createConnection } from "node:net";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
// Define the minimum frame header size for message validation.
const MIN_FRAME_SIZE = 3;
// Define the fixed32 field size in bytes.
const FIXED32_SIZE = 4;
// Define the ESPHome API protocol version we support.
var ProtocolVersion;
(function (ProtocolVersion) {
    // Major version for breaking changes in base protocol - mismatch causes immediate disconnect.
    ProtocolVersion[ProtocolVersion["MAJOR"] = 1] = "MAJOR";
    // Minor version for breaking changes in individual messages - mismatch causes warning.
    ProtocolVersion[ProtocolVersion["MINOR"] = 12] = "MINOR";
})(ProtocolVersion || (ProtocolVersion = {}));
// Define the Noise handshake states.
var Handshake;
(function (Handshake) {
    Handshake[Handshake["HELLO"] = 1] = "HELLO";
    Handshake[Handshake["HANDSHAKE"] = 2] = "HANDSHAKE";
    Handshake[Handshake["READY"] = 3] = "READY";
    Handshake[Handshake["CLOSED"] = 4] = "CLOSED";
})(Handshake || (Handshake = {}));
// Connection states for adaptive encryption detection. When a PSK is provided, we try encryption first before falling back to attempting a plaintext connection.
// Without a PSK, we only attempt a plaintext connection.
var ConnectionState;
(function (ConnectionState) {
    ConnectionState[ConnectionState["INITIAL"] = 0] = "INITIAL";
    ConnectionState[ConnectionState["TRYING_PLAINTEXT"] = 1] = "TRYING_PLAINTEXT";
    ConnectionState[ConnectionState["TRYING_NOISE"] = 2] = "TRYING_NOISE";
    ConnectionState[ConnectionState["CONNECTED"] = 3] = "CONNECTED";
    ConnectionState[ConnectionState["FAILED"] = 4] = "FAILED";
})(ConnectionState || (ConnectionState = {}));
// Protocols that the ESPHome API supports.
var ProtocolType;
(function (ProtocolType) {
    ProtocolType[ProtocolType["PLAINTEXT"] = 0] = "PLAINTEXT";
    ProtocolType[ProtocolType["NOISE"] = 1] = "NOISE";
})(ProtocolType || (ProtocolType = {}));
/**
 * Log levels supported by ESPHome for log subscriptions. These control the verbosity of log messages received from the device.
 */
export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["NONE"] = 0] = "NONE";
    LogLevel[LogLevel["ERROR"] = 1] = "ERROR";
    LogLevel[LogLevel["WARN"] = 2] = "WARN";
    LogLevel[LogLevel["INFO"] = 3] = "INFO";
    LogLevel[LogLevel["DEBUG"] = 4] = "DEBUG";
    LogLevel[LogLevel["VERBOSE"] = 5] = "VERBOSE";
    LogLevel[LogLevel["VERY_VERBOSE"] = 6] = "VERY_VERBOSE";
})(LogLevel || (LogLevel = {}));
/**
 * Climate modes supported by ESPHome climate entities. These define the primary operating state of HVAC systems.
 */
export var ClimateMode;
(function (ClimateMode) {
    ClimateMode[ClimateMode["OFF"] = 0] = "OFF";
    ClimateMode[ClimateMode["HEAT_COOL"] = 1] = "HEAT_COOL";
    ClimateMode[ClimateMode["COOL"] = 2] = "COOL";
    ClimateMode[ClimateMode["HEAT"] = 3] = "HEAT";
    ClimateMode[ClimateMode["FAN_ONLY"] = 4] = "FAN_ONLY";
    ClimateMode[ClimateMode["DRY"] = 5] = "DRY";
    ClimateMode[ClimateMode["AUTO"] = 6] = "AUTO";
})(ClimateMode || (ClimateMode = {}));
/**
 * Climate fan modes supported by ESPHome climate entities. These control how the fan operates within the HVAC system.
 */
export var ClimateFanMode;
(function (ClimateFanMode) {
    ClimateFanMode[ClimateFanMode["ON"] = 0] = "ON";
    ClimateFanMode[ClimateFanMode["OFF"] = 1] = "OFF";
    ClimateFanMode[ClimateFanMode["AUTO"] = 2] = "AUTO";
    ClimateFanMode[ClimateFanMode["LOW"] = 3] = "LOW";
    ClimateFanMode[ClimateFanMode["MEDIUM"] = 4] = "MEDIUM";
    ClimateFanMode[ClimateFanMode["HIGH"] = 5] = "HIGH";
    ClimateFanMode[ClimateFanMode["MIDDLE"] = 6] = "MIDDLE";
    ClimateFanMode[ClimateFanMode["FOCUS"] = 7] = "FOCUS";
    ClimateFanMode[ClimateFanMode["DIFFUSE"] = 8] = "DIFFUSE";
    ClimateFanMode[ClimateFanMode["QUIET"] = 9] = "QUIET";
})(ClimateFanMode || (ClimateFanMode = {}));
/**
 * Climate swing modes supported by ESPHome climate entities. These control the direction of airflow from the HVAC system.
 */
export var ClimateSwingMode;
(function (ClimateSwingMode) {
    ClimateSwingMode[ClimateSwingMode["OFF"] = 0] = "OFF";
    ClimateSwingMode[ClimateSwingMode["BOTH"] = 1] = "BOTH";
    ClimateSwingMode[ClimateSwingMode["VERTICAL"] = 2] = "VERTICAL";
    ClimateSwingMode[ClimateSwingMode["HORIZONTAL"] = 3] = "HORIZONTAL";
})(ClimateSwingMode || (ClimateSwingMode = {}));
/**
 * Climate presets supported by ESPHome climate entities. These are predefined configurations for common scenarios.
 */
export var ClimatePreset;
(function (ClimatePreset) {
    ClimatePreset[ClimatePreset["NONE"] = 0] = "NONE";
    ClimatePreset[ClimatePreset["HOME"] = 1] = "HOME";
    ClimatePreset[ClimatePreset["AWAY"] = 2] = "AWAY";
    ClimatePreset[ClimatePreset["BOOST"] = 3] = "BOOST";
    ClimatePreset[ClimatePreset["COMFORT"] = 4] = "COMFORT";
    ClimatePreset[ClimatePreset["ECO"] = 5] = "ECO";
    ClimatePreset[ClimatePreset["SLEEP"] = 6] = "SLEEP";
    ClimatePreset[ClimatePreset["ACTIVITY"] = 7] = "ACTIVITY";
})(ClimatePreset || (ClimatePreset = {}));
/**
 * Climate actions that indicate the current activity of the HVAC system. These represent what the climate device is actively doing.
 */
export var ClimateAction;
(function (ClimateAction) {
    ClimateAction[ClimateAction["OFF"] = 0] = "OFF";
    ClimateAction[ClimateAction["COOLING"] = 2] = "COOLING";
    ClimateAction[ClimateAction["HEATING"] = 3] = "HEATING";
    ClimateAction[ClimateAction["IDLE"] = 4] = "IDLE";
    ClimateAction[ClimateAction["DRYING"] = 5] = "DRYING";
    ClimateAction[ClimateAction["FAN"] = 6] = "FAN";
})(ClimateAction || (ClimateAction = {}));
/**
 * Valve operation states that indicate the current activity of a valve. These represent what the valve is actively doing.
 */
export var ValveOperation;
(function (ValveOperation) {
    ValveOperation[ValveOperation["IDLE"] = 0] = "IDLE";
    ValveOperation[ValveOperation["IS_OPENING"] = 1] = "IS_OPENING";
    ValveOperation[ValveOperation["IS_CLOSING"] = 2] = "IS_CLOSING";
})(ValveOperation || (ValveOperation = {}));
/**
 * Alarm control panel state commands for controlling the alarm system.
 */
export var AlarmControlPanelCommand;
(function (AlarmControlPanelCommand) {
    AlarmControlPanelCommand[AlarmControlPanelCommand["DISARM"] = 0] = "DISARM";
    AlarmControlPanelCommand[AlarmControlPanelCommand["ARM_AWAY"] = 1] = "ARM_AWAY";
    AlarmControlPanelCommand[AlarmControlPanelCommand["ARM_HOME"] = 2] = "ARM_HOME";
    AlarmControlPanelCommand[AlarmControlPanelCommand["ARM_NIGHT"] = 3] = "ARM_NIGHT";
    AlarmControlPanelCommand[AlarmControlPanelCommand["ARM_VACATION"] = 4] = "ARM_VACATION";
    AlarmControlPanelCommand[AlarmControlPanelCommand["ARM_CUSTOM_BYPASS"] = 5] = "ARM_CUSTOM_BYPASS";
    AlarmControlPanelCommand[AlarmControlPanelCommand["TRIGGER"] = 6] = "TRIGGER";
})(AlarmControlPanelCommand || (AlarmControlPanelCommand = {}));
/**
 * Color modes supported by ESPHome light entities. These define the color control capabilities of lights.
 */
export var ColorMode;
(function (ColorMode) {
    ColorMode[ColorMode["UNKNOWN"] = 0] = "UNKNOWN";
    ColorMode[ColorMode["ON_OFF"] = 1] = "ON_OFF";
    ColorMode[ColorMode["BRIGHTNESS"] = 3] = "BRIGHTNESS";
    ColorMode[ColorMode["WHITE"] = 7] = "WHITE";
    ColorMode[ColorMode["COLOR_TEMPERATURE"] = 11] = "COLOR_TEMPERATURE";
    ColorMode[ColorMode["COLD_WARM_WHITE"] = 19] = "COLD_WARM_WHITE";
    ColorMode[ColorMode["RGB"] = 35] = "RGB";
    ColorMode[ColorMode["RGB_WHITE"] = 39] = "RGB_WHITE";
    ColorMode[ColorMode["RGB_COLOR_TEMPERATURE"] = 47] = "RGB_COLOR_TEMPERATURE";
    ColorMode[ColorMode["RGB_COLD_WARM_WHITE"] = 51] = "RGB_COLD_WARM_WHITE";
})(ColorMode || (ColorMode = {}));
/**
 * Media player commands supported by ESPHome media player entities.
 */
export var MediaPlayerCommand;
(function (MediaPlayerCommand) {
    MediaPlayerCommand[MediaPlayerCommand["PLAY"] = 0] = "PLAY";
    MediaPlayerCommand[MediaPlayerCommand["PAUSE"] = 1] = "PAUSE";
    MediaPlayerCommand[MediaPlayerCommand["STOP"] = 2] = "STOP";
    MediaPlayerCommand[MediaPlayerCommand["MUTE"] = 3] = "MUTE";
    MediaPlayerCommand[MediaPlayerCommand["UNMUTE"] = 4] = "UNMUTE";
    MediaPlayerCommand[MediaPlayerCommand["TOGGLE"] = 5] = "TOGGLE";
    MediaPlayerCommand[MediaPlayerCommand["VOLUME_UP"] = 6] = "VOLUME_UP";
    MediaPlayerCommand[MediaPlayerCommand["VOLUME_DOWN"] = 7] = "VOLUME_DOWN";
    MediaPlayerCommand[MediaPlayerCommand["ENQUEUE"] = 8] = "ENQUEUE";
    MediaPlayerCommand[MediaPlayerCommand["REPEAT_ONE"] = 9] = "REPEAT_ONE";
    MediaPlayerCommand[MediaPlayerCommand["REPEAT_OFF"] = 10] = "REPEAT_OFF";
    MediaPlayerCommand[MediaPlayerCommand["CLEAR_PLAYLIST"] = 11] = "CLEAR_PLAYLIST";
    MediaPlayerCommand[MediaPlayerCommand["TURN_ON"] = 12] = "TURN_ON";
    MediaPlayerCommand[MediaPlayerCommand["TURN_OFF"] = 13] = "TURN_OFF";
})(MediaPlayerCommand || (MediaPlayerCommand = {}));
/**
 * Lock commands supported by ESPHome lock entities.
 */
export var LockCommand;
(function (LockCommand) {
    LockCommand[LockCommand["UNLOCK"] = 0] = "UNLOCK";
    LockCommand[LockCommand["LOCK"] = 1] = "LOCK";
    LockCommand[LockCommand["OPEN"] = 2] = "OPEN";
})(LockCommand || (LockCommand = {}));
/**
 * Cover operation states indicating what a cover is currently doing.
 */
export var CoverOperation;
(function (CoverOperation) {
    CoverOperation[CoverOperation["IDLE"] = 0] = "IDLE";
    CoverOperation[CoverOperation["IS_OPENING"] = 1] = "IS_OPENING";
    CoverOperation[CoverOperation["IS_CLOSING"] = 2] = "IS_CLOSING";
})(CoverOperation || (CoverOperation = {}));
/**
 * Service argument types supported by ESPHome user-defined services.
 */
export var ServiceArgType;
(function (ServiceArgType) {
    ServiceArgType[ServiceArgType["BOOL"] = 0] = "BOOL";
    ServiceArgType[ServiceArgType["INT"] = 1] = "INT";
    ServiceArgType[ServiceArgType["FLOAT"] = 2] = "FLOAT";
    ServiceArgType[ServiceArgType["STRING"] = 3] = "STRING";
    ServiceArgType[ServiceArgType["BOOL_ARRAY"] = 4] = "BOOL_ARRAY";
    ServiceArgType[ServiceArgType["INT_ARRAY"] = 5] = "INT_ARRAY";
    ServiceArgType[ServiceArgType["FLOAT_ARRAY"] = 6] = "FLOAT_ARRAY";
    ServiceArgType[ServiceArgType["STRING_ARRAY"] = 7] = "STRING_ARRAY";
})(ServiceArgType || (ServiceArgType = {}));
/**
 * Voice assistant subscription flags that control what data is received.
 */
export var VoiceAssistantSubscribeFlag;
(function (VoiceAssistantSubscribeFlag) {
    VoiceAssistantSubscribeFlag[VoiceAssistantSubscribeFlag["NONE"] = 0] = "NONE";
    VoiceAssistantSubscribeFlag[VoiceAssistantSubscribeFlag["API_AUDIO"] = 1] = "API_AUDIO";
})(VoiceAssistantSubscribeFlag || (VoiceAssistantSubscribeFlag = {}));
/**
 * Voice assistant request flags that control how the assistant operates.
 */
export var VoiceAssistantRequestFlag;
(function (VoiceAssistantRequestFlag) {
    VoiceAssistantRequestFlag[VoiceAssistantRequestFlag["NONE"] = 0] = "NONE";
    VoiceAssistantRequestFlag[VoiceAssistantRequestFlag["USE_VAD"] = 1] = "USE_VAD";
    VoiceAssistantRequestFlag[VoiceAssistantRequestFlag["USE_WAKE_WORD"] = 2] = "USE_WAKE_WORD";
})(VoiceAssistantRequestFlag || (VoiceAssistantRequestFlag = {}));
/**
 * Voice assistant events that indicate the state of voice processing.
 */
export var VoiceAssistantEvent;
(function (VoiceAssistantEvent) {
    VoiceAssistantEvent[VoiceAssistantEvent["ERROR"] = 0] = "ERROR";
    VoiceAssistantEvent[VoiceAssistantEvent["RUN_START"] = 1] = "RUN_START";
    VoiceAssistantEvent[VoiceAssistantEvent["RUN_END"] = 2] = "RUN_END";
    VoiceAssistantEvent[VoiceAssistantEvent["STT_START"] = 3] = "STT_START";
    VoiceAssistantEvent[VoiceAssistantEvent["STT_END"] = 4] = "STT_END";
    VoiceAssistantEvent[VoiceAssistantEvent["INTENT_START"] = 5] = "INTENT_START";
    VoiceAssistantEvent[VoiceAssistantEvent["INTENT_END"] = 6] = "INTENT_END";
    VoiceAssistantEvent[VoiceAssistantEvent["TTS_START"] = 7] = "TTS_START";
    VoiceAssistantEvent[VoiceAssistantEvent["TTS_END"] = 8] = "TTS_END";
    VoiceAssistantEvent[VoiceAssistantEvent["WAKE_WORD_START"] = 9] = "WAKE_WORD_START";
    VoiceAssistantEvent[VoiceAssistantEvent["WAKE_WORD_END"] = 10] = "WAKE_WORD_END";
    VoiceAssistantEvent[VoiceAssistantEvent["STT_VAD_START"] = 11] = "STT_VAD_START";
    VoiceAssistantEvent[VoiceAssistantEvent["STT_VAD_END"] = 12] = "STT_VAD_END";
    VoiceAssistantEvent[VoiceAssistantEvent["TTS_STREAM_START"] = 98] = "TTS_STREAM_START";
    VoiceAssistantEvent[VoiceAssistantEvent["TTS_STREAM_END"] = 99] = "TTS_STREAM_END";
    VoiceAssistantEvent[VoiceAssistantEvent["INTENT_PROGRESS"] = 100] = "INTENT_PROGRESS";
})(VoiceAssistantEvent || (VoiceAssistantEvent = {}));
/**
 * Voice assistant timer events that indicate timer state changes.
 */
export var VoiceAssistantTimerEvent;
(function (VoiceAssistantTimerEvent) {
    VoiceAssistantTimerEvent[VoiceAssistantTimerEvent["STARTED"] = 0] = "STARTED";
    VoiceAssistantTimerEvent[VoiceAssistantTimerEvent["UPDATED"] = 1] = "UPDATED";
    VoiceAssistantTimerEvent[VoiceAssistantTimerEvent["CANCELLED"] = 2] = "CANCELLED";
    VoiceAssistantTimerEvent[VoiceAssistantTimerEvent["FINISHED"] = 3] = "FINISHED";
})(VoiceAssistantTimerEvent || (VoiceAssistantTimerEvent = {}));
/**
 * We support almost all of the ESPHome API message types. These message types define the protocol communication between the client and the ESPHome device.
 */
var MessageType;
(function (MessageType) {
    MessageType[MessageType["HELLO_REQUEST"] = 1] = "HELLO_REQUEST";
    MessageType[MessageType["HELLO_RESPONSE"] = 2] = "HELLO_RESPONSE";
    MessageType[MessageType["AUTHENTICATION_REQUEST"] = 3] = "AUTHENTICATION_REQUEST";
    MessageType[MessageType["CONNECT_REQUEST"] = 3] = "CONNECT_REQUEST";
    MessageType[MessageType["AUTHENTICATION_RESPONSE"] = 4] = "AUTHENTICATION_RESPONSE";
    MessageType[MessageType["CONNECT_RESPONSE"] = 4] = "CONNECT_RESPONSE";
    MessageType[MessageType["DISCONNECT_REQUEST"] = 5] = "DISCONNECT_REQUEST";
    MessageType[MessageType["DISCONNECT_RESPONSE"] = 6] = "DISCONNECT_RESPONSE";
    MessageType[MessageType["PING_REQUEST"] = 7] = "PING_REQUEST";
    MessageType[MessageType["PING_RESPONSE"] = 8] = "PING_RESPONSE";
    MessageType[MessageType["DEVICE_INFO_REQUEST"] = 9] = "DEVICE_INFO_REQUEST";
    MessageType[MessageType["DEVICE_INFO_RESPONSE"] = 10] = "DEVICE_INFO_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_REQUEST"] = 11] = "LIST_ENTITIES_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_BINARY_SENSOR_RESPONSE"] = 12] = "LIST_ENTITIES_BINARY_SENSOR_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_COVER_RESPONSE"] = 13] = "LIST_ENTITIES_COVER_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_FAN_RESPONSE"] = 14] = "LIST_ENTITIES_FAN_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_LIGHT_RESPONSE"] = 15] = "LIST_ENTITIES_LIGHT_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_SENSOR_RESPONSE"] = 16] = "LIST_ENTITIES_SENSOR_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_SWITCH_RESPONSE"] = 17] = "LIST_ENTITIES_SWITCH_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_TEXT_SENSOR_RESPONSE"] = 18] = "LIST_ENTITIES_TEXT_SENSOR_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_DONE_RESPONSE"] = 19] = "LIST_ENTITIES_DONE_RESPONSE";
    MessageType[MessageType["SUBSCRIBE_STATES_REQUEST"] = 20] = "SUBSCRIBE_STATES_REQUEST";
    MessageType[MessageType["BINARY_SENSOR_STATE_RESPONSE"] = 21] = "BINARY_SENSOR_STATE_RESPONSE";
    MessageType[MessageType["COVER_STATE_RESPONSE"] = 22] = "COVER_STATE_RESPONSE";
    MessageType[MessageType["FAN_STATE_RESPONSE"] = 23] = "FAN_STATE_RESPONSE";
    MessageType[MessageType["LIGHT_STATE_RESPONSE"] = 24] = "LIGHT_STATE_RESPONSE";
    MessageType[MessageType["SENSOR_STATE_RESPONSE"] = 25] = "SENSOR_STATE_RESPONSE";
    MessageType[MessageType["SWITCH_STATE_RESPONSE"] = 26] = "SWITCH_STATE_RESPONSE";
    MessageType[MessageType["TEXT_SENSOR_STATE_RESPONSE"] = 27] = "TEXT_SENSOR_STATE_RESPONSE";
    MessageType[MessageType["SUBSCRIBE_LOGS_REQUEST"] = 28] = "SUBSCRIBE_LOGS_REQUEST";
    MessageType[MessageType["SUBSCRIBE_LOGS_RESPONSE"] = 29] = "SUBSCRIBE_LOGS_RESPONSE";
    MessageType[MessageType["COVER_COMMAND_REQUEST"] = 30] = "COVER_COMMAND_REQUEST";
    MessageType[MessageType["FAN_COMMAND_REQUEST"] = 31] = "FAN_COMMAND_REQUEST";
    MessageType[MessageType["LIGHT_COMMAND_REQUEST"] = 32] = "LIGHT_COMMAND_REQUEST";
    MessageType[MessageType["SWITCH_COMMAND_REQUEST"] = 33] = "SWITCH_COMMAND_REQUEST";
    MessageType[MessageType["SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST"] = 34] = "SUBSCRIBE_HOMEASSISTANT_SERVICES_REQUEST";
    MessageType[MessageType["HOMEASSISTANT_ACTION_REQUEST"] = 35] = "HOMEASSISTANT_ACTION_REQUEST";
    MessageType[MessageType["GET_TIME_REQUEST"] = 36] = "GET_TIME_REQUEST";
    MessageType[MessageType["GET_TIME_RESPONSE"] = 37] = "GET_TIME_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_SERVICES_RESPONSE"] = 41] = "LIST_ENTITIES_SERVICES_RESPONSE";
    MessageType[MessageType["EXECUTE_SERVICE_REQUEST"] = 42] = "EXECUTE_SERVICE_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_CAMERA_RESPONSE"] = 43] = "LIST_ENTITIES_CAMERA_RESPONSE";
    MessageType[MessageType["CAMERA_IMAGE_RESPONSE"] = 44] = "CAMERA_IMAGE_RESPONSE";
    MessageType[MessageType["CAMERA_IMAGE_REQUEST"] = 45] = "CAMERA_IMAGE_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_CLIMATE_RESPONSE"] = 46] = "LIST_ENTITIES_CLIMATE_RESPONSE";
    MessageType[MessageType["CLIMATE_STATE_RESPONSE"] = 47] = "CLIMATE_STATE_RESPONSE";
    MessageType[MessageType["CLIMATE_COMMAND_REQUEST"] = 48] = "CLIMATE_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_NUMBER_RESPONSE"] = 49] = "LIST_ENTITIES_NUMBER_RESPONSE";
    MessageType[MessageType["NUMBER_STATE_RESPONSE"] = 50] = "NUMBER_STATE_RESPONSE";
    MessageType[MessageType["NUMBER_COMMAND_REQUEST"] = 51] = "NUMBER_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_SELECT_RESPONSE"] = 52] = "LIST_ENTITIES_SELECT_RESPONSE";
    MessageType[MessageType["SELECT_STATE_RESPONSE"] = 53] = "SELECT_STATE_RESPONSE";
    MessageType[MessageType["SELECT_COMMAND_REQUEST"] = 54] = "SELECT_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_SIREN_RESPONSE"] = 55] = "LIST_ENTITIES_SIREN_RESPONSE";
    MessageType[MessageType["SIREN_STATE_RESPONSE"] = 56] = "SIREN_STATE_RESPONSE";
    MessageType[MessageType["SIREN_COMMAND_REQUEST"] = 57] = "SIREN_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_LOCK_RESPONSE"] = 58] = "LIST_ENTITIES_LOCK_RESPONSE";
    MessageType[MessageType["LOCK_STATE_RESPONSE"] = 59] = "LOCK_STATE_RESPONSE";
    MessageType[MessageType["LOCK_COMMAND_REQUEST"] = 60] = "LOCK_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_BUTTON_RESPONSE"] = 61] = "LIST_ENTITIES_BUTTON_RESPONSE";
    MessageType[MessageType["BUTTON_COMMAND_REQUEST"] = 62] = "BUTTON_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_MEDIA_PLAYER_RESPONSE"] = 63] = "LIST_ENTITIES_MEDIA_PLAYER_RESPONSE";
    MessageType[MessageType["MEDIA_PLAYER_STATE_RESPONSE"] = 64] = "MEDIA_PLAYER_STATE_RESPONSE";
    MessageType[MessageType["MEDIA_PLAYER_COMMAND_REQUEST"] = 65] = "MEDIA_PLAYER_COMMAND_REQUEST";
    MessageType[MessageType["SUBSCRIBE_VOICE_ASSISTANT_REQUEST"] = 89] = "SUBSCRIBE_VOICE_ASSISTANT_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_REQUEST"] = 90] = "VOICE_ASSISTANT_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_RESPONSE"] = 91] = "VOICE_ASSISTANT_RESPONSE";
    MessageType[MessageType["VOICE_ASSISTANT_EVENT_RESPONSE"] = 92] = "VOICE_ASSISTANT_EVENT_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE"] = 94] = "LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE";
    MessageType[MessageType["ALARM_CONTROL_PANEL_STATE_RESPONSE"] = 95] = "ALARM_CONTROL_PANEL_STATE_RESPONSE";
    MessageType[MessageType["ALARM_CONTROL_PANEL_COMMAND_REQUEST"] = 96] = "ALARM_CONTROL_PANEL_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_TEXT_RESPONSE"] = 97] = "LIST_ENTITIES_TEXT_RESPONSE";
    MessageType[MessageType["TEXT_STATE_RESPONSE"] = 98] = "TEXT_STATE_RESPONSE";
    MessageType[MessageType["TEXT_COMMAND_REQUEST"] = 99] = "TEXT_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_DATE_RESPONSE"] = 100] = "LIST_ENTITIES_DATE_RESPONSE";
    MessageType[MessageType["DATE_STATE_RESPONSE"] = 101] = "DATE_STATE_RESPONSE";
    MessageType[MessageType["DATE_COMMAND_REQUEST"] = 102] = "DATE_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_TIME_RESPONSE"] = 103] = "LIST_ENTITIES_TIME_RESPONSE";
    MessageType[MessageType["TIME_STATE_RESPONSE"] = 104] = "TIME_STATE_RESPONSE";
    MessageType[MessageType["TIME_COMMAND_REQUEST"] = 105] = "TIME_COMMAND_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_AUDIO"] = 106] = "VOICE_ASSISTANT_AUDIO";
    MessageType[MessageType["LIST_ENTITIES_EVENT_RESPONSE"] = 107] = "LIST_ENTITIES_EVENT_RESPONSE";
    MessageType[MessageType["EVENT_RESPONSE"] = 108] = "EVENT_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_VALVE_RESPONSE"] = 109] = "LIST_ENTITIES_VALVE_RESPONSE";
    MessageType[MessageType["VALVE_STATE_RESPONSE"] = 110] = "VALVE_STATE_RESPONSE";
    MessageType[MessageType["VALVE_COMMAND_REQUEST"] = 111] = "VALVE_COMMAND_REQUEST";
    MessageType[MessageType["LIST_ENTITIES_DATETIME_RESPONSE"] = 112] = "LIST_ENTITIES_DATETIME_RESPONSE";
    MessageType[MessageType["DATETIME_STATE_RESPONSE"] = 113] = "DATETIME_STATE_RESPONSE";
    MessageType[MessageType["DATETIME_COMMAND_REQUEST"] = 114] = "DATETIME_COMMAND_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_TIMER_EVENT_RESPONSE"] = 115] = "VOICE_ASSISTANT_TIMER_EVENT_RESPONSE";
    MessageType[MessageType["LIST_ENTITIES_UPDATE_RESPONSE"] = 116] = "LIST_ENTITIES_UPDATE_RESPONSE";
    MessageType[MessageType["UPDATE_STATE_RESPONSE"] = 117] = "UPDATE_STATE_RESPONSE";
    MessageType[MessageType["UPDATE_COMMAND_REQUEST"] = 118] = "UPDATE_COMMAND_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_ANNOUNCE_REQUEST"] = 119] = "VOICE_ASSISTANT_ANNOUNCE_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_ANNOUNCE_FINISHED"] = 120] = "VOICE_ASSISTANT_ANNOUNCE_FINISHED";
    MessageType[MessageType["VOICE_ASSISTANT_CONFIGURATION_REQUEST"] = 121] = "VOICE_ASSISTANT_CONFIGURATION_REQUEST";
    MessageType[MessageType["VOICE_ASSISTANT_CONFIGURATION_RESPONSE"] = 122] = "VOICE_ASSISTANT_CONFIGURATION_RESPONSE";
    MessageType[MessageType["VOICE_ASSISTANT_SET_CONFIGURATION"] = 123] = "VOICE_ASSISTANT_SET_CONFIGURATION";
    MessageType[MessageType["NOISE_ENCRYPTION_SET_KEY_REQUEST"] = 124] = "NOISE_ENCRYPTION_SET_KEY_REQUEST";
    MessageType[MessageType["NOISE_ENCRYPTION_SET_KEY_RESPONSE"] = 125] = "NOISE_ENCRYPTION_SET_KEY_RESPONSE";
})(MessageType || (MessageType = {}));
/**
 * Wire types used in protobuf encoding. These define how data is encoded on the wire in the protocol buffer format.
 */
var WireType;
(function (WireType) {
    WireType[WireType["VARINT"] = 0] = "VARINT";
    WireType[WireType["FIXED64"] = 1] = "FIXED64";
    WireType[WireType["LENGTH_DELIMITED"] = 2] = "LENGTH_DELIMITED";
    WireType[WireType["FIXED32"] = 5] = "FIXED32";
})(WireType || (WireType = {}));
/**
 * The main ESPHome native API client class for communicating with ESP8266/ESP32 devices running ESPHome firmware. This class provides a complete implementation of the
 * ESPHome native API protocol, handling all the complexity of binary message encoding/decoding, connection management, entity discovery, and state synchronization.
 *
 * The client operates as an event-driven state machine that manages the entire connection lifecycle. It automatically handles encryption negotiation, falls back to
 * plaintext when needed, discovers all available entities, and maintains real-time state synchronization through the subscription system. The design prioritizes
 * reliability with automatic reconnection, comprehensive error handling, and detailed logging for debugging.
 *
 * ## Connection Management
 *
 * The client intelligently manages connections based on the provided configuration. When an encryption key is provided, it attempts a Noise-encrypted connection first,
 * falling back to plaintext if the device doesn't support encryption. This adaptive approach ensures maximum compatibility while preferring security when available.
 *
 * ## Entity Discovery and Control
 *
 * Upon connection, the client automatically discovers all entities configured on the ESPHome device. Each entity is assigned a unique identifier following the pattern
 * `{type}-{object_id}`, making it easy to reference entities in your code. The client provides type-safe methods for controlling each entity type, from simple switches
 * to complex climate systems.
 *
 * ## Real-time State Synchronization
 *
 * The client maintains a real-time view of all entity states through its subscription system. State changes are immediately pushed from the device and emitted as typed
 * events, allowing your application to react instantly to changes in the physical world.
 *
 * @extends EventEmitter
 *
 * @event connect - Emitted when successfully connected to the device. Provides encryption status.
 * @event disconnect - Emitted when disconnected from the device. Includes optional reason string.
 * @event error - Emitted when an error occurs. Provides error details for debugging.
 * @event deviceInfo - Emitted when device information is received. Includes full DeviceInfo object.
 * @event entities - Emitted when entity discovery completes. Provides array of all discovered entities.
 * @event services - Emitted when user-defined services are discovered. Provides service definitions.
 * @event telemetry - Emitted for all state updates. Provides generic TelemetryEvent for any entity type.
 * @event log - Emitted when device logs are received. Includes log level and message.
 * @event heartbeat - Emitted on ping/pong exchange. Useful for connection monitoring.
 * @event timeSync - Emitted when time synchronization occurs. Provides epoch seconds.
 * @event camera - Emitted when camera images are received. Includes image buffer and metadata.
 * @event voiceAssistantRequest - Emitted when voice assistant requests are received from device.
 * @event voiceAssistantAnnounceFinished - Emitted when voice assistant announcement completes.
 * @event voiceAssistantConfiguration - Emitted when voice assistant configuration is received.
 * @event voiceAssistantAudio - Emitted when voice assistant audio data is received.
 * @event noiseKeySet - Emitted when encryption key update completes. Indicates success/failure.
 *
 * Entity-specific events are also emitted for each entity type:
 * @event switch - Switch state changes
 * @event binary_sensor - Binary sensor state changes
 * @event sensor - Sensor value updates
 * @event text_sensor - Text sensor value updates
 * @event light - Light state changes
 * @event fan - Fan state changes
 * @event cover - Cover position/operation changes
 * @event climate - Climate state changes
 * @event number - Number value changes
 * @event select - Select option changes
 * @event text - Text value changes
 * @event date - Date value changes
 * @event time - Time value changes
 * @event datetime - DateTime value changes
 * @event button - Button press events
 * @event lock - Lock state changes
 * @event valve - Valve position/operation changes
 * @event siren - Siren state changes
 * @event media_player - Media player state changes
 * @event alarm_control_panel - Alarm panel state changes
 * @event event - Event entity triggers
 * @event update - Update availability notifications
 *
 * @example Comprehensive Setup with Error Handling
 * ```typescript
 * import { EspHomeClient, LogLevel } from "./esphome-client";
 *
 * // Create a robust client with full error handling and reconnection.
 * const client = new EspHomeClient({
 *   host: "192.168.1.100",
 *   port: 6053,
 *   encryptionKey: process.env.ESPHOME_KEY, // Store keys securely
 *   clientId: "home-automation-hub",
 *   reconnect: true,
 *   reconnectInterval: 15000,
 *   connectionTimeout: 30000,
 *   logger: {
 *     debug: (msg) => console.log(`[DEBUG] ${msg}`),
 *     info: (msg) => console.log(`[INFO] ${msg}`),
 *     warn: (msg) => console.warn(`[WARN] ${msg}`),
 *     error: (msg) => console.error(`[ERROR] ${msg}`)
 *   }
 * });
 *
 * // Set up comprehensive event handling.
 * client.on("connect", ({ encrypted }) => {
 *   console.log(`✓ Connected to ESPHome device (encrypted: ${encrypted})`);
 *
 *   // Subscribe to logs for debugging.
 *   client.subscribeToLogs(LogLevel.INFO);
 *
 *   // Log all available entities.
 *   client.logAllEntityIds();
 * });
 *
 * client.on("disconnect", (reason) => {
 *   console.log(`✗ Disconnected: ${reason || "Connection lost"}`);
 * });
 *
 * client.on("error", (error) => {
 *   console.error("Client error:", error);
 *   // Implement your error recovery logic here.
 * });
 *
 * client.on("deviceInfo", (info) => {
 *   console.log(`Device: ${info.name} v${info.esphomeVersion}`);
 *   console.log(`Model: ${info.model}, MAC: ${info.macAddress}`);
 * });
 *
 * // Connect with error handling.
 * try {
 *   await client.connect();
 * } catch (error) {
 *   console.error("Failed to connect:", error);
 *   process.exit(1);
 * }
 *
 * // Graceful shutdown.
 * process.on("SIGINT", () => {
 *   console.log("\\nShutting down...");
 *   client.disconnect();
 *   process.exit(0);
 * });
 * ```
 *
 * @example Smart Home Automation Logic
 * ```typescript
 * // Build a motion-activated lighting system with time-based rules.
 * const client = new EspHomeClient({ host: "hallway-controller.local" });
 *
 * // Track motion and light states.
 * let motionDetected = false;
 * let lightsOn = false;
 * let lastMotion = Date.now();
 *
 * client.on("binary_sensor", (data) => {
 *   if (data.entity === "binary_sensor-hallway_motion") {
 *     motionDetected = data.state;
 *     lastMotion = Date.now();
 *
 *     if (motionDetected && !lightsOn) {
 *       // Check time of day for brightness.
 *       const hour = new Date().getHours();
 *       const brightness = ((hour >= 22) || (hour < 6)) ? 0.1 : 0.8;
 *
 *       client.sendLightCommand("light-hallway", {
 *         state: true,
 *         brightness,
 *         transition: 1.0
 *       });
 *     }
 *   }
 * });
 *
 * client.on("light", (data) => {
 *   if (data.entity === "light-hallway") {
 *     lightsOn = data.state;
 *   }
 * });
 *
 * // Auto-off timer.
 * setInterval(() => {
 *   if (lightsOn && !motionDetected && (Date.now() - lastMotion) > 300000) {
 *     client.sendLightCommand("light-hallway", {
 *       state: false,
 *       transition: 3.0
 *     });
 *   }
 * }, 10000);
 * ```
 *
 * @example Voice Assistant Integration
 * ```typescript
 * // Integrate with voice assistant capabilities.
 * const client = new EspHomeClient({ host: "voice-device.local" });
 *
 * // Subscribe to voice assistant with audio streaming.
 * client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);
 *
 * // Handle wake word detection.
 * client.on("voiceAssistantRequest", async (data) => {
 *   if (data.start && data.flags & VoiceAssistantRequestFlag.USE_WAKE_WORD) {
 *     console.log(`Wake word detected: "${data.wakeWordPhrase}"`);
 *
 *     // Start your audio streaming server.
 *     const audioPort = await startAudioServer();
 *     client.sendVoiceAssistantResponse(audioPort, false);
 *   }
 * });
 *
 * // Process voice assistant events.
 * client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_START);
 * // ... perform speech recognition ...
 * client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_END, [
 *   { name: "text", value: "Turn on the living room lights" }
 * ]);
 * ```
 */
export class EspHomeClient extends EventEmitter {
    // The client information string to announce when we connect to an ESPHome device.
    clientId;
    // The TCP socket connection to the ESPHome device.
    clientSocket;
    // The data event listener function reference for cleanup.
    dataListener;
    // The hostname or IP address of the ESPHome device.
    host;
    // Logging interface for debug and error messages.
    log;
    // The port number for the ESPHome API connection.
    port;
    // Buffer for accumulating incoming data until complete messages are received.
    recvBuffer;
    // Device information received from the ESPHome device.
    remoteDeviceInfo;
    // Array storing all discovered entities from the device.
    discoveredEntities;
    // Map from entity identifier strings to their numeric keys.
    entityKeys;
    // Map from entity keys to their human-readable names.
    entityNames;
    // Map from entity keys to their object IDs.
    entityObjectIds;
    // Map from entity keys to their device IDs (when devices are supported).
    entityDeviceIds;
    // Map from entity keys to their type labels.
    entityTypes;
    // Array storing all discovered user-defined services from the device.
    discoveredServices;
    // Map from service keys to their service entities.
    services;
    // Voice assistant subscription state.
    voiceAssistantSubscribed;
    // Voice assistant configuration.
    voiceAssistantConfig;
    // Camera image buffers for reassembling multi-packet images.
    cameraImageBuffers;
    // The pre-shared key for Noise encryption (base64 encoded).
    encryptionKey;
    // The expected server name for validation (optional).
    expectedServerName;
    // Noise handshake client instance.
    noiseClient;
    // Current handshake state.
    handshakeState;
    // Connection state for adaptive encryption detection.
    connectionState;
    // Timer for connection timeout.
    connectionTimer;
    // Flag to track if we're using encryption for this connection.
    usingEncryption;
    // Promise resolver for noise key set operations.
    noiseKeySetResolver;
    // Device API minor version for protocol compatibility checks.
    deviceApiMinorVersion;
    /**
     * Creates a new ESPHome client instance. The client can be configured for both encrypted and unencrypted connections depending on the provided options. When a PSK
     * is provided, the client will automatically attempt encryption first and fall back to plaintext if the device doesn't support it.
     *
     * @param options - Configuration options for the client connection.
     * @param options.clientId - Optional client identifier to announce when connecting (default: "esphome-client").
     * @param options.host - The hostname or IP address of the ESPHome device.
     * @param options.logger - Optional logging interface for debug and error messages. If not provided, defaults to console methods.
     * @param options.port - The port number for the ESPHome API (default: 6053).
     * @param options.psk - Optional base64 encoded pre-shared key for Noise encryption. Must be exactly 32 bytes when decoded.
     * @param options.serverName - Optional expected server name for validation during encrypted connections.
     *
     * @example
     * ```typescript
     * // Minimal configuration for unencrypted connection.
     * const client = new EspHomeClient({ host: "192.168.1.100" });
     *
     * // Full configuration with all options except serverName.
     * const client = new EspHomeClient({
     *   host: "192.168.1.100",
     *   port: 6053,
     *   clientId: "homebridge-ratgdo",
     *   psk: "base64encodedkey",
     *   logger: myLogger
     * });
     * ```
     */
    constructor(options) {
        super();
        options.logger ??= {
            /* eslint-disable no-console */
            debug: () => { },
            error: (message, ...parameters) => console.error(message, ...parameters),
            info: (message, ...parameters) => console.log(message, ...parameters),
            warn: (message, ...parameters) => console.log(message, ...parameters)
            /* eslint-enable no-console */
        };
        this.clientId = options.clientId ?? "esphome-client";
        this.clientSocket = null;
        this.dataListener = null;
        this.discoveredEntities = [];
        this.discoveredServices = [];
        this.entityKeys = new Map();
        this.entityNames = new Map();
        this.entityObjectIds = new Map();
        this.entityDeviceIds = new Map();
        this.entityTypes = new Map();
        this.services = new Map();
        this.voiceAssistantSubscribed = false;
        this.voiceAssistantConfig = null;
        this.cameraImageBuffers = new Map();
        this.host = options.host;
        this.log = options.logger;
        this.port = options.port ?? 6053;
        this.recvBuffer = Buffer.alloc(0);
        this.remoteDeviceInfo = null;
        this.encryptionKey = options.psk ?? null;
        this.expectedServerName = options.serverName ?? null;
        this.noiseClient = null;
        this.handshakeState = Handshake.CLOSED;
        this.connectionState = ConnectionState.INITIAL;
        this.connectionTimer = null;
        this.usingEncryption = false;
        this.noiseKeySetResolver = null;
        this.deviceApiMinorVersion = 0;
        // Validate the encryption key format if provided.
        if (this.encryptionKey) {
            const keyBuffer = Buffer.from(this.encryptionKey, "base64");
            if (keyBuffer.length !== 32) {
                this.log.error("Invalid encryption key provided.");
                this.encryptionKey = null;
            }
        }
    }
    /**
     * Connect to the ESPHome device and start communication. This method initializes a new connection. If an encryption key is provided, it will attempt an encrypted
     * connection first and fall back to plaintext if the device doesn't support encryption. Without an encryption key, only plaintext connections are attempted.
     */
    connect() {
        // Clean up any existing connections and resources before starting fresh.
        if (this.clientSocket) {
            this.clientSocket.destroy();
            this.clientSocket = null;
        }
        this.cleanupNoiseResources();
        this.cleanupDataListener();
        this.clearConnectionTimer();
        // Reset buffer state to ensure clean message processing.
        this.recvBuffer = Buffer.alloc(0);
        // Reset entity discovery state for the new connection.
        this.discoveredEntities = [];
        this.discoveredServices = [];
        this.entityKeys.clear();
        this.entityNames.clear();
        this.entityTypes.clear();
        this.services.clear();
        this.voiceAssistantSubscribed = false;
        this.voiceAssistantConfig = null;
        this.cameraImageBuffers.clear();
        this.remoteDeviceInfo = null;
        // Reset the handshake state for a fresh connection.
        this.handshakeState = Handshake.CLOSED;
        this.noiseClient = null;
        this.connectionState = ConnectionState.INITIAL;
        this.usingEncryption = false;
        this.noiseKeySetResolver = null;
        this.deviceApiMinorVersion = 0;
        // Create the initial connection.
        this.createConnection();
    }
    /**
     * Create a new TCP connection to the ESPHome device. This is a separate method to allow reconnection with different protocols when falling back from encrypted to
     * plaintext connections.
     */
    createConnection() {
        // Create a new TCP connection to the ESPHome device.
        this.clientSocket = createConnection({ host: this.host, port: this.port });
        // Handle successful connection by initiating the handshake process.
        this.clientSocket.on("connect", () => this.handleConnect());
        // Set up the data handler for incoming messages.
        this.dataListener = (chunk) => this.handleData(chunk);
        this.clientSocket.on("data", this.dataListener);
        // Handle socket errors by logging and disconnecting.
        this.clientSocket.once("error", (err) => this.handleSocketError(err));
        // Handle socket closure by checking if we need to retry with encryption.
        this.clientSocket.once("close", () => this.handleSocketClose());
    }
    /**
     * Internal disconnect method that cleans up resources and emits the disconnect event.
     *
     * @param reason - Optional reason for the disconnection.
     */
    _disconnect(reason) {
        // Clean up the data listener.
        this.cleanupDataListener();
        // Clean up Noise resources.
        this.cleanupNoiseResources();
        // Clear connection timer.
        this.clearConnectionTimer();
        // Clear any pending camera image buffers.
        this.cameraImageBuffers.clear();
        // Destroy the socket connection.
        if (this.clientSocket) {
            this.clientSocket.destroy();
            this.clientSocket = null;
        }
        this.connectionState = ConnectionState.FAILED;
        this.emit("disconnect", reason);
    }
    /**
     * Disconnect from the ESPHome device and cleanup resources. This method should be called when you're done communicating with the device.
     */
    disconnect() {
        this._disconnect();
    }
    /**
     * Clean up Noise encryption resources.
     */
    cleanupNoiseResources() {
        this.noiseClient?.destroy();
        this.noiseClient = null;
        // After all resources have been cleaned up, we reset the handshake state.
        this.handshakeState = Handshake.CLOSED;
    }
    /**
     * Clear the connection timer if it exists. This prevents timeout callbacks from firing after they're no longer needed.
     */
    clearConnectionTimer() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
            this.connectionTimer = null;
        }
    }
    /**
     * Set a connection timer for timeout detection. This helps detect when a connection attempt has stalled.
     *
     * @param timeout - Timeout duration in milliseconds (default: 5000).
     */
    setConnectionTimer(timeout = 5000) {
        this.clearConnectionTimer();
        this.connectionTimer = setTimeout(() => this.handleConnectionTimeout, timeout);
    }
    /**
     * Handle connection timeout based on the current connection state. This method determines what to do when a connection attempt times out.
     */
    handleConnectionTimeout() {
        this.log.debug("Connection attempt timed out in state: " + this.connectionState);
        switch (this.connectionState) {
            case ConnectionState.TRYING_NOISE:
                // Noise encryption handshake timed out. This could mean the device doesn't support encryption, so we try plaintext as a fallback.
                this.log.debug("Noise encryption handshake timed out. The device may not support encryption. Trying plaintext connection.");
                // Close the current connection and try again with plaintext.
                this.cleanupDataListener();
                this.cleanupNoiseResources();
                if (this.clientSocket) {
                    this.clientSocket.destroy();
                    this.clientSocket = null;
                }
                // Reset the buffer and set state for plaintext connection.
                this.recvBuffer = Buffer.alloc(0);
                this.connectionState = ConnectionState.TRYING_PLAINTEXT;
                this.usingEncryption = false;
                // Create a new connection for plaintext protocol.
                this.createConnection();
                break;
            case ConnectionState.TRYING_PLAINTEXT:
                // Plaintext connection attempt timed out. If we started with encryption and fell back to plaintext, this means the device is not responding. If we started with
                // plaintext because no PSK was provided, the device might still require encryption.
                if (this.encryptionKey && this.noiseClient) {
                    // We have an encryption key but haven't tried it yet (only possible if we started without PSK).
                    this.log.error("Connection failed. The device is not responding to connection attempts.");
                }
                else {
                    // No encryption key is available, and plaintext failed.
                    this.log.error("Connection failed. The device is not responding or may require encryption.");
                }
                this._disconnect("connection timeout");
                break;
            default:
                // Unexpected timeout in an unknown state.
                this.log.error("Connection timeout in unexpected state: " + this.connectionState + ".");
                this.disconnect();
                break;
        }
    }
    /**
     * Handle a newly connected socket. This method is called when the TCP connection is established.
     */
    handleConnect() {
        this.log.debug("Connected to " + this.host + ":" + this.port + ".");
        // Defines a helper to start a plaintext connection by setting the state, initializing the connection timer, and sending the hello message.
        const startPlaintext = () => {
            this.connectionState = ConnectionState.TRYING_PLAINTEXT;
            this.setConnectionTimer();
            this.sendHello();
        };
        // Determine which protocol to use based on the current connection state.
        switch (this.connectionState) {
            case ConnectionState.TRYING_PLAINTEXT:
                // If we are already trying plaintext, continue the plaintext workflow.
                startPlaintext();
                break;
            case ConnectionState.TRYING_NOISE:
                // If we are already trying Noise, continue with the Noise handshake.
                this.initializeNoiseHandshake();
                break;
            default:
                // Otherwise, this is the initial attempt, so decide based on encryption availability. If an encryption key and Noise are available, attempt encrypted first.
                if (this.encryptionKey) {
                    this.log.debug("Encryption key provided, attempting encrypted connection first.");
                    this.connectionState = ConnectionState.TRYING_NOISE;
                    this.initializeNoiseHandshake();
                    break;
                }
                // If no key is available, fall back to a plaintext connection.
                startPlaintext();
                break;
        }
    }
    /**
     * Initialize the Noise handshake for encrypted connections. This sets up the Noise protocol state and sends the initial handshake message.
     */
    initializeNoiseHandshake() {
        // Ensure we have the required dependencies before proceeding.
        if (!this.encryptionKey) {
            throw new Error("Missing encryption key");
        }
        // Create the Noise handshake state.
        this.noiseClient = createESPHomeHandshake({ logger: this.log, psk: Buffer.from(this.encryptionKey, "base64") });
        this.handshakeState = Handshake.HELLO;
        this.usingEncryption = true;
        // Send empty frame to start the handshake.
        this.writeNoiseFrame(Buffer.alloc(0));
        this.setConnectionTimer();
    }
    /**
     * Send a hello request to let ESPHome know who we are. This is the initial message sent to establish communication when unencrypted. When encrypted, this is sent
     * after we've established a secure connection.
     */
    sendHello() {
        // Prepare the client information string for the hello message.
        const clientInfo = Buffer.from(this.clientId, "utf8");
        // Build the hello payload fields according to HelloRequest specification.
        // Field 1: client_info (string) - Description of the client for debugging purposes.
        // Field 2: api_version_major (uint32) - Major version for protocol compatibility.
        // Field 3: api_version_minor (uint32) - Minor version for message compatibility.
        this.frameAndSend(MessageType.HELLO_REQUEST, this.encodeProtoFields([
            { fieldNumber: 1, value: clientInfo, wireType: WireType.LENGTH_DELIMITED },
            { fieldNumber: 2, value: ProtocolVersion.MAJOR, wireType: WireType.VARINT },
            { fieldNumber: 3, value: ProtocolVersion.MINOR, wireType: WireType.VARINT }
        ]));
    }
    /**
     * Handle the hello response from the ESPHome device and check protocol version compatibility.
     *
     * @param payload - The hello response payload containing version information.
     */
    handleHelloResponse(payload) {
        // Decode the protobuf fields from the payload according to HelloResponse specification.
        const fields = this.decodeProtobuf(payload);
        // Extract the API version from the response.
        // Field 1: api_version_major (uint32) - Major version for protocol compatibility.
        // Field 2: api_version_minor (uint32) - Minor version for message compatibility.
        const majorVersion = this.extractNumberField(fields, 1);
        const minorVersion = this.extractNumberField(fields, 2);
        // Extract optional fields from the response.
        // Field 3: server_info (string) - Server description (since API 1.6).
        // Field 4: name (string) - Device name (since API 1.7).
        const serverInfo = this.extractStringField(fields, 3);
        const deviceName = this.extractStringField(fields, 4);
        // Log the device information if available.
        if (serverInfo) {
            this.log.debug("ESPHome server info: " + serverInfo);
        }
        if (deviceName) {
            this.log.debug("ESPHome device name: " + deviceName);
        }
        // Check protocol version compatibility.
        if ((majorVersion !== undefined) && (minorVersion !== undefined)) {
            // Store the device API version for protocol compatibility checks.
            this.deviceApiMinorVersion = minorVersion;
            this.log.debug("ESPHome API version: " + majorVersion + "." + minorVersion + " (client supports: " + ProtocolVersion.MAJOR + "." + ProtocolVersion.MINOR + ")");
            // Check major version compatibility - mismatch causes immediate disconnect.
            if (majorVersion !== ProtocolVersion.MAJOR) {
                this.log.error("Incompatible API major version. Device: " + majorVersion + ", Client: " + ProtocolVersion.MAJOR + ". Disconnecting.");
                this._disconnect("Incompatible API version");
                return;
            }
            // Check minor version compatibility - mismatch causes warning.
            if (minorVersion !== ProtocolVersion.MINOR) {
                // Server has newer minor version - some features may not be available.
                if (minorVersion > ProtocolVersion.MINOR) {
                    this.log.debug("Device uses newer API minor version (" + minorVersion + " vs " + ProtocolVersion.MINOR + "). Some features may not be available.");
                }
                else {
                    // Server has older minor version - we should be backwards compatible.
                    this.log.debug("Device uses older API minor version (" + minorVersion + " vs " + ProtocolVersion.MINOR + "). Using compatibility mode.");
                }
            }
        }
        else {
            this.log.warn("Device did not provide API version information.");
        }
    }
    /**
     * Handle socket errors by logging appropriate messages and disconnecting.
     *
     * @param err - The socket error that occurred.
     */
    handleSocketError(err) {
        switch (err.code) {
            case "ECONNREFUSED":
                this.log.error("Connection refused.");
                break;
            case "ECONNRESET":
                this.log.error("Connection reset.");
                break;
            case "EHOSTDOWN":
            case "EHOSTUNREACH":
                this.log.error("Device unreachable.");
                break;
            case "ETIMEDOUT":
                this.log.error("Connection timed out.");
                break;
            default:
                this.log.error("Socket error: " + err.code + " | " + err + ".");
                break;
        }
        this.disconnect();
    }
    /**
     * Handle socket closure. If we were trying encryption and the socket closed, it might be because the device doesn't support encryption.
     */
    handleSocketClose() {
        this.log.debug("Socket closed");
        this.handshakeState = Handshake.CLOSED;
        // Check if we need to fall back based on the connection state.
        if (this.connectionState === ConnectionState.TRYING_NOISE) {
            // We were trying encryption and the socket closed. This might mean the device doesn't support encryption, so let's try plaintext.
            this.log.debug("Socket closed during encryption attempt. The device may not support encryption. Trying plaintext connection.");
            // Clean up and try again with plaintext.
            this.cleanupDataListener();
            this.cleanupNoiseResources();
            this.recvBuffer = Buffer.alloc(0);
            this.connectionState = ConnectionState.TRYING_PLAINTEXT;
            this.usingEncryption = false;
            // Create a new connection for plaintext protocol.
            this.createConnection();
            return;
        }
        // Log an issue in our fallback to plaintext connectivity.
        if ((this.connectionState === ConnectionState.TRYING_PLAINTEXT) && this.encryptionKey && this.noiseClient) {
            // We were trying plaintext and the socket closed. We're done.
            this.log.debug("Socket closed during plaintext attempt after encryption fallback.");
        }
    }
    /**
     * Clean up the data listener if it exists.
     */
    cleanupDataListener() {
        if (this.dataListener && this.clientSocket) {
            this.clientSocket.off("data", this.dataListener);
            this.dataListener = null;
        }
    }
    /**
     * Handle incoming raw data, frame messages, and dispatch. This method accumulates data and processes complete frames.
     *
     * @param chunk - The incoming data chunk from the socket.
     */
    handleData(chunk) {
        // Append the new data chunk to our receive buffer.
        this.recvBuffer = Buffer.concat([this.recvBuffer, chunk]);
        // Check if we need to detect encryption based on the first byte. This only happens when no PSK was provided initially.
        if ((this.connectionState === ConnectionState.TRYING_PLAINTEXT) && (this.recvBuffer.length > 0) && !this.encryptionKey) {
            // If the first byte is 0x01, indicating we have a Noise frame. This means the server requires encryption but no key was provided.
            if (this.recvBuffer[0] === ProtocolType.NOISE) {
                this.log.debug("Detected Noise frame indicator. The server requires encryption.");
                // The server requires encryption but we don't have a key.
                this._disconnect("encryption key missing");
                return;
            }
        }
        // Sanity check.
        if (this.recvBuffer.length === 0) {
            return;
        }
        // Process frames based on whether we're using encryption, based on our indicator byte.
        const indicator = this.recvBuffer[0];
        // If server requires Noise but we have no key, bail out early.
        if ((indicator === ProtocolType.NOISE) && !this.encryptionKey) {
            this.log.debug("Detected Noise frame indicator. The server requires encryption.");
            this._disconnect("encryption key missing");
            return;
        }
        if (indicator === ProtocolType.NOISE) {
            this.processNoiseFrames();
            return;
        }
        if (indicator === ProtocolType.PLAINTEXT) {
            this.processPlaintextFrames();
            return;
        }
        // Unknown sentinel: drop buffer to resync.
        this.log.error("Unknown frame indicator: 0x" + indicator.toString(16) + ".");
        this.recvBuffer = Buffer.alloc(0);
    }
    /**
     * Process Noise protocol frames. This handles the Noise handshake and encrypted message processing.
     */
    processNoiseFrames() {
        let frame;
        let message;
        try {
            while ((frame = this.extractNoiseFrame())) {
                switch (this.handshakeState) {
                    case Handshake.HELLO:
                        this.handleNoiseHello(frame);
                        break;
                    case Handshake.HANDSHAKE:
                        this.handleNoiseHandshake(frame);
                        break;
                    case Handshake.READY:
                        // Ensure we have a decryptor before attempting to decrypt.
                        if (!this.noiseClient?.receiveCipher) {
                            throw new Error("Decryptor not available");
                        }
                        // Decrypt and process the message.
                        message = this.deserializeNoiseMessage(Buffer.from(this.noiseClient.receiveCipher.DecryptWithAd(Buffer.alloc(0), frame)));
                        if (message) {
                            this.handleMessage(message.type, message.payload);
                        }
                        break;
                }
            }
        }
        catch (err) {
            const isPlaintext = this.recvBuffer[0] === ProtocolType.PLAINTEXT;
            const noiseFailed = (this.connectionState === ConnectionState.TRYING_NOISE) && (this.handshakeState !== Handshake.READY);
            // If Noise was expected but failed and it's not plaintext, disconnect as encryption key is invalid.
            if (!isPlaintext && noiseFailed) {
                this._disconnect("encryption key invalid");
                return;
            }
            // If it's not plaintext and another error occurred, just log and exit.
            if (!isPlaintext) {
                this.log.error("Error processing Noise frames: " + err + ".");
                return;
            }
            // If Noise failed but plaintext is possible, fall back to plaintext connection.
            if (noiseFailed) {
                this.log.debug("Noise handshake failed. Attempting to fall back to plaintext connection.");
                this.cleanupDataListener();
                this.cleanupNoiseResources();
                if (this.clientSocket) {
                    this.clientSocket.destroy();
                    this.clientSocket = null;
                }
                this.recvBuffer = Buffer.alloc(0);
                this.connectionState = ConnectionState.TRYING_PLAINTEXT;
                this.usingEncryption = false;
                this.createConnection();
                return;
            }
            // Otherwise, just disconnect.
            this.disconnect();
        }
    }
    /**
     * Extract a Noise frame from the receive buffer. Noise frames have a specific format: [0x01][size_high][size_low][data...].
     *
     * @returns The frame data or null if incomplete.
     */
    extractNoiseFrame() {
        if (this.recvBuffer.length < 3) {
            return null;
        }
        const indicator = this.recvBuffer[0];
        if (indicator !== ProtocolType.NOISE) {
            throw new Error("Bad format. Expected 0x01 indicator, got 0x" + indicator.toString(16));
        }
        // Read frame size (big-endian).
        const frameSize = (this.recvBuffer[1] << 8) | this.recvBuffer[2];
        const frameEnd = 3 + frameSize;
        if (this.recvBuffer.length < frameEnd) {
            return null;
        }
        // Extract the frame.
        const frame = this.recvBuffer.subarray(3, frameEnd);
        // Remove the processed frame from the buffer.
        this.recvBuffer = this.recvBuffer.subarray(frameEnd);
        return frame;
    }
    /**
     * Handle the Noise hello response. This processes the server's protocol selection and validates the server name if configured.
     *
     * @param serverHello - The server hello data.
     */
    handleNoiseHello(serverHello) {
        const chosenProto = serverHello[0];
        if (chosenProto !== 1) {
            throw new Error("Unknown protocol selected by server: " + chosenProto);
        }
        // Validate server name if expected.
        if (this.expectedServerName) {
            const serverNameEnd = serverHello.indexOf(0, 1);
            if (serverNameEnd > 1) {
                const serverName = serverHello.subarray(1, serverNameEnd).toString();
                if (this.expectedServerName !== serverName) {
                    throw new Error("Server name mismatch, expected " + this.expectedServerName + ", got " + serverName + ".");
                }
            }
        }
        // Proceed to handshake phase.
        this.handshakeState = Handshake.HANDSHAKE;
        // Send the Noise handshake message.
        if (!this.noiseClient) {
            throw new Error("Noise client not initialized.");
        }
        const handshakeMessage = this.noiseClient.writeMessage();
        this.writeNoiseFrame(Buffer.concat([Buffer.from([0]), handshakeMessage]));
        this.setConnectionTimer();
    }
    /**
     * Handle the Noise handshake response. This completes the Noise handshake and establishes the encrypted channel.
     *
     * @param serverHandshake - The server handshake data.
     */
    handleNoiseHandshake(serverHandshake) {
        const header = serverHandshake[0];
        const message = serverHandshake.subarray(1);
        if (header !== 0) {
            throw new Error("Handshake failure: " + message.toString());
        }
        // Ensure we have a noise client before proceeding.
        if (!this.noiseClient) {
            throw new Error("Noise client not initialized");
        }
        // Process the handshake message.
        this.noiseClient.readMessage(message);
        // Update state to ready.
        this.handshakeState = Handshake.READY;
        this.connectionState = ConnectionState.CONNECTED;
        this.clearConnectionTimer();
        this.log.debug("Noise handshake complete, encryption enabled.");
        // Continue with our hello.
        this.sendHello();
    }
    /**
     * Write a Noise protocol frame. Frames are sent with a specific header format for the Noise protocol.
     *
     * @param frame - The frame data to send.
     */
    writeNoiseFrame(frame) {
        if (!this.clientSocket || this.clientSocket.destroyed) {
            this.log.debug("Attempted to write to a closed socket.");
            return;
        }
        const frameData = frame;
        const frameLength = frameData.length;
        // Create the header: [0x01][size_high][size_low].
        const header = Buffer.from([ProtocolType.NOISE, (frameLength >> 8) & 0xFF, frameLength & 0xFF]);
        // Send the complete frame.
        this.clientSocket.write(Buffer.concat([header, frameData]));
    }
    /**
     * Serialize a message for Noise protocol. This creates the message format used within encrypted frames.
     *
     * @param type - The message type.
     * @param payload - The message payload.
     *
     * @returns The serialized message buffer.
     */
    serializeNoiseMessage(type, payload) {
        const messageId = type;
        const messageLength = payload.length;
        // Create the message format: [id_high][id_low][len_high][len_low][payload].
        const buffer = Buffer.concat([Buffer.from([(messageId >> 8) & 0xFF, messageId & 0xFF, (messageLength >> 8) & 0xFF, messageLength & 0xFF]), payload]);
        return buffer;
    }
    /**
     * Deserialize a Noise protocol message. This extracts the message type and payload from the decrypted data.
     *
     * @param buffer - The buffer to deserialize.
     *
     * @returns The message type and payload, or null if invalid.
     */
    deserializeNoiseMessage(buffer) {
        if (buffer.length < 4) {
            return null;
        }
        const messageId = (buffer[0] << 8) | buffer[1];
        const messageLength = (buffer[2] << 8) | buffer[3];
        if (buffer.length < 4 + messageLength) {
            return null;
        }
        const payload = buffer.subarray(4, 4 + messageLength);
        return { payload, type: messageId };
    }
    /**
     * Process plaintext frames during the handshake phase. This handles unencrypted message processing for devices that don't require encryption.
     */
    processPlaintextFrames() {
        while (this.recvBuffer.length >= MIN_FRAME_SIZE) {
            const indicator = this.recvBuffer[0];
            // If a Noise frame shows up here, redirect instead of erroring.
            if ((indicator === ProtocolType.NOISE) && this.encryptionKey) {
                this.log.debug("Plaintext parser saw Noise indicator; redirecting to Noise processing.");
                this.processNoiseFrames();
                return;
            }
            // Verify the frame starts with the expected sentinel byte.
            if (indicator !== ProtocolType.PLAINTEXT) {
                this.log.error("Framing error: missing 0x00.");
                this.recvBuffer = Buffer.alloc(0);
                return;
            }
            // Read the message length as a varint.
            const [length, lenBytes] = this.readVarint(this.recvBuffer, 1);
            // Read the message type as a varint.
            const [type, typeBytes] = this.readVarint(this.recvBuffer, 1 + lenBytes);
            // Calculate the total header size.
            const headerSize = 1 + lenBytes + typeBytes;
            // Check if we have received the complete message payload.
            if (this.recvBuffer.length < (headerSize + length)) {
                break;
            }
            // Extract the message payload.
            const payload = this.recvBuffer.subarray(headerSize, headerSize + length);
            // Process the complete message.
            this.handleMessage(type, payload);
            // Remove the processed message from the receive buffer.
            this.recvBuffer = this.recvBuffer.subarray(headerSize + length);
        }
    }
    /**
     * Dispatch based on message type. This is the main message router that handles all protocol messages.
     *
     * @param type - The message type identifier.
     * @param payload - The message payload data.
     */
    handleMessage(type, payload) {
        let epoch, nowBuf;
        // Emit a generic message event for all message types.
        this.emit("message", { payload, type });
        // Handle specific message types.
        switch (type) {
            case MessageType.HELLO_RESPONSE:
                this.clearConnectionTimer();
                // Process the hello response to check API version compatibility.
                this.handleHelloResponse(payload);
                // We got a plaintext hello response, indicate we are connected and we're done.
                if (!this.usingEncryption) {
                    this.connectionState = ConnectionState.CONNECTED;
                    this.usingEncryption = false;
                    // Log if we have an encryption key but the device doesn't use it.
                    if (this.encryptionKey) {
                        this.log.debug("Device responded to plaintext hello. The device does not support encryption, using plaintext connection.");
                    }
                }
                // ESPHome API 1.11 (introduced in ESPHome 2025.8.0) made the CONNECT_REQUEST optional for passwordless connections. For older versions, we must send
                // CONNECT_REQUEST and wait for CONNECT_RESPONSE before proceeding to entity enumeration.
                if (this.deviceApiMinorVersion < 11) {
                    // For API versions before 1.11, we must complete the legacy handshake by sending CONNECT_REQUEST.
                    this.log.debug("Using legacy handshake for API version 1." + this.deviceApiMinorVersion + ". Sending CONNECT_REQUEST.");
                    this.frameAndSend(MessageType.CONNECT_REQUEST, Buffer.alloc(0));
                    break;
                }
                // For API 1.11+, authentication messages are only used when password authentication is enabled. For unauthenticated connections, we skip directly to entity
                // enumeration and device info after the HELLO handshake.
                this.log.debug("Using modern handshake for API version 1." + this.deviceApiMinorVersion + ". Skipping CONNECT_REQUEST.");
                this.emit("connect", this.usingEncryption);
                // Start entity enumeration immediately for unauthenticated connections.
                this.frameAndSend(MessageType.LIST_ENTITIES_REQUEST, Buffer.alloc(0));
                // Query device information.
                this.frameAndSend(MessageType.DEVICE_INFO_REQUEST, Buffer.alloc(0));
                break;
            case MessageType.AUTHENTICATION_RESPONSE:
            case MessageType.CONNECT_RESPONSE:
                // Emit connect event for our clients to indicate we are ready.
                this.emit("connect", this.usingEncryption);
                // Start entity enumeration after successful connection.
                this.frameAndSend(MessageType.LIST_ENTITIES_REQUEST, Buffer.alloc(0));
                // Query device information once we're connected.
                this.frameAndSend(MessageType.DEVICE_INFO_REQUEST, Buffer.alloc(0));
                break;
            case MessageType.DISCONNECT_REQUEST:
                // Respond to disconnect request and then disconnect.
                this.frameAndSend(MessageType.DISCONNECT_RESPONSE, Buffer.alloc(0));
                this.disconnect();
                break;
            case MessageType.DISCONNECT_RESPONSE:
                // The device has acknowledged our disconnect request.
                this.disconnect();
                break;
            case MessageType.DEVICE_INFO_RESPONSE:
                // Process the device information response.
                this.handleDeviceInfoResponse(payload);
                // Emit the device info event.
                this.emit("deviceInfo", this.remoteDeviceInfo);
                break;
            case MessageType.LIST_ENTITIES_DONE_RESPONSE:
                // Entity enumeration is complete.
                // Emit the complete list of discovered entities.
                this.emit("entities", this.discoveredEntities);
                // Emit the complete list of discovered services.
                if (this.discoveredServices.length > 0) {
                    this.emit("services", this.discoveredServices);
                }
                // Now that we know all the entities we have available, subscribe to state updates.
                this.frameAndSend(MessageType.SUBSCRIBE_STATES_REQUEST, Buffer.alloc(0));
                break;
            case MessageType.PING_REQUEST:
                this.log.debug("Received PingRequest, replying");
                // Respond to ping requests to keep the connection alive.
                this.frameAndSend(MessageType.PING_RESPONSE, Buffer.alloc(0));
                // Emit heartbeat event for connection monitoring.
                this.emit("heartbeat");
                break;
            case MessageType.PING_RESPONSE:
                // Emit heartbeat event for connection monitoring.
                this.emit("heartbeat");
                break;
            case MessageType.GET_TIME_REQUEST:
                // We got a time‐sync request from the device; reply with our current epoch.
                this.log.debug("Received GetTimeRequest, replying with current epoch time");
                // Prepare a four-byte little‐endian buffer.
                nowBuf = Buffer.alloc(FIXED32_SIZE);
                // Calculate our time in seconds and encode it in our buffer.
                nowBuf.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
                // Build the protobuf field: field 1, fixed32 wire type, then encode and send the message.
                this.frameAndSend(MessageType.GET_TIME_RESPONSE, this.encodeProtoFields([{ fieldNumber: 1, value: nowBuf, wireType: WireType.FIXED32 }]));
                break;
            case MessageType.GET_TIME_RESPONSE:
                // Decode the fields in the GetTimeResponse payload and extract the epoch_seconds fixed32 field (field 1).
                epoch = this.extractFixed32Field(this.decodeProtobuf(payload), 1);
                if (epoch !== undefined) {
                    // Emit a `timeSync` event carrying the returned epoch seconds.
                    this.emit("timeSync", epoch);
                    this.log.debug("Received GetTimeResponse: epoch seconds", epoch);
                }
                break;
            case MessageType.SUBSCRIBE_LOGS_RESPONSE:
                // Process the log message response from the device.
                this.handleLogResponse(payload);
                break;
            case MessageType.HOMEASSISTANT_ACTION_REQUEST:
                // Process the log message response from the device.
                this.handleHomeAssistantActionRequest(payload);
                break;
            case MessageType.CAMERA_IMAGE_RESPONSE:
                // Process camera image response from the device. Camera images are sent as binary data with metadata.
                this.handleCameraImageResponse(payload);
                break;
            case MessageType.VOICE_ASSISTANT_REQUEST:
                // Handle voice assistant request from the device.
                this.handleVoiceAssistantRequest(payload);
                break;
            case MessageType.VOICE_ASSISTANT_ANNOUNCE_FINISHED:
                // Handle voice assistant announce finished response.
                this.handleVoiceAssistantAnnounceFinished(payload);
                break;
            case MessageType.VOICE_ASSISTANT_CONFIGURATION_RESPONSE:
                // Handle voice assistant configuration response.
                this.handleVoiceAssistantConfigurationResponse(payload);
                break;
            case MessageType.VOICE_ASSISTANT_AUDIO:
                // Handle voice assistant audio data.
                this.handleVoiceAssistantAudio(payload);
                break;
            case MessageType.NOISE_ENCRYPTION_SET_KEY_RESPONSE:
                // Process the noise encryption key set response.
                this.handleNoiseKeySetResponse(payload);
                break;
            default:
                // Check if this is a list entities response.
                if (this.isListEntitiesResponse(type)) {
                    this.handleListEntity(type, payload);
                    return;
                }
                // Check if this is a state update.
                if (this.isStateUpdate(type)) {
                    this.handleTelemetry(type, payload);
                    return;
                }
                // Unhandled message type.
                this.log.warn("Unhandled message type: " + type + " | payload: " + payload.toString("hex") + ".");
                break;
        }
    }
    /**
     * Handle log response messages from the ESPHome device. This processes incoming log messages and emits appropriate events for monitoring and debugging.
     *
     * @param payload - The log response payload containing the log level and message.
     */
    handleLogResponse(payload) {
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        // Extract the log level from field 1. This indicates the severity of the log message.
        const level = this.extractNumberField(fields, 1);
        if (level === undefined) {
            this.log.warn("Received log response without a valid level.");
            return;
        }
        // Extract the message content from field 3. This is the actual log text from the device.
        const message = this.extractStringField(fields, 3);
        if (message === undefined) {
            this.log.warn("Received log response without a message.");
            return;
        }
        // Extract the optional send_failed flag from field 4. This indicates if there was an issue sending the log.
        const sendFailed = this.extractBoolField(fields, 4);
        // Create the log event data structure with all the extracted information.
        const logData = {
            level: level,
            message,
            sendFailed: sendFailed || undefined
        };
        // Emit the log event for consumers to handle.
        this.emit("log", logData);
        // Also log it through our internal logger at the appropriate level for debugging.
        this.log.debug("ESPHome Log [" + LogLevel[level] + "]: " + message);
    }
    /**
     * Handle Home Assistant action request messages from the ESPHome device.
     * This processes incoming requests to execute Home Assistant services or fire events,
     * parsing the protobuf payload and emitting the appropriate event with structured data.
     *
     * @param payload - The protobuf-encoded payload containing either an event or action request.
     *                  Events include: event name and variables.
     *                  Actions include: service name, data, data templates, variables, call ID, and response settings.
     */
    handleHomeAssistantActionRequest(payload) {
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        const is_event = this.extractBoolField(fields, 5) ?? false;
        if (is_event) {
            // Create the Home Assistant event data structure with all the extracted information.
            const eventData = {
                event: this.extractStringField(fields, 1),
                variables: this.extractKeyValuePairs(fields, 4) ?? []
            };
            this.log.debug("Received Home Assistant event");
            this.emit("event", eventData);
        }
        else {
            // Create the Home Assistant action request data structure with all the extracted information.
            const responseData = {
                action: this.extractStringField(fields, 1),
                data: this.extractKeyValuePairs(fields, 2) ?? [],
                data_template: this.extractKeyValuePairs(fields, 3) ?? [],
                variables: this.extractKeyValuePairs(fields, 4) ?? [],
                call_id: this.extractNumberField(fields, 6),
                wants_response: this.extractBoolField(fields, 7) ?? false,
                response_template: this.extractStringField(fields, 8),
            };
            this.log.debug("Received Home Assistant action request");
            this.emit("actionRequest", responseData);
        }
    }
    /**
     * Handle camera image response from the ESPHome device. This processes incoming camera images and reassembles multi-packet images before emitting.
     *
     * @param payload - The camera image response payload containing the image data and metadata.
     */
    handleCameraImageResponse(payload) {
        // Decode the protobuf fields from the payload according to CameraImageResponse specification.
        const fields = this.decodeProtobuf(payload);
        // Extract the entity key from field 1 (fixed32 key).
        const key = this.extractEntityKey(fields, 1);
        if (key === undefined) {
            this.log.warn("Received camera image without a valid entity key.");
            return;
        }
        // Look up the entity information using the key.
        const name = this.entityNames.get(key) ?? ("unknown(" + key + ")");
        // Extract the image data from field 2 (bytes data). This is a chunk of raw image bytes in the format configured on the device.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const imageData = fields[2]?.[0];
        if (!Buffer.isBuffer(imageData)) {
            this.log.warn("Received camera image without valid image data for entity: " + name + ".");
            return;
        }
        // Extract the done flag from field 3 (bool done).
        // This indicates if this is the last packet for the current image.
        const done = this.extractBoolField(fields, 3);
        // Note: field 4 (device_id) is optional and not commonly used in single-device setups.
        // Get or create the buffer array for this camera.
        let buffers = this.cameraImageBuffers.get(key);
        if (!buffers) {
            buffers = [];
            this.cameraImageBuffers.set(key, buffers);
        }
        // Add this packet's data to the buffer.
        buffers.push(imageData);
        // If this is the last packet, concatenate all buffers and emit the complete image.
        if (done) {
            // Concatenate all buffered packets into a single image.
            const completeImage = Buffer.concat(buffers);
            // Clear the buffer for this camera.
            this.cameraImageBuffers.delete(key);
            // Emit the complete camera image event for consumers to handle.
            this.emit("camera", { image: completeImage, name });
            this.log.debug("Received complete camera image from " + name + " | size: " + completeImage.length + " bytes");
        }
        else {
            // Still receiving packets for this image.
            this.log.debug("Buffering camera image packet from " + name + " | packet size: " + imageData.length + " bytes | total packets: " + buffers.length);
        }
    }
    /**
     * Handle noise encryption key set response from the ESPHome device. This processes the response to setting a new encryption key.
     *
     * @param payload - The response payload containing the success status.
     */
    handleNoiseKeySetResponse(payload) {
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        // Extract the success flag from field 1.
        const success = this.extractBoolField(fields, 1) ?? false;
        this.log.debug("Noise encryption key set response: " + (success ? "success" : "failed"));
        // Emit the noise key set event.
        this.emit("noiseKeySet", success);
        // Resolve the promise if there's a pending resolver.
        if (this.noiseKeySetResolver) {
            this.noiseKeySetResolver(success);
            this.noiseKeySetResolver = null;
        }
    }
    /**
     * Handle voice assistant request from the ESPHome device.
     *
     * @param payload - The request payload containing voice assistant settings.
     */
    handleVoiceAssistantRequest(payload) {
        // Decode the protobuf fields from the payload according to VoiceAssistantRequest specification.
        const fields = this.decodeProtobuf(payload);
        // Extract the start flag from field 1.
        const start = this.extractBoolField(fields, 1);
        // Extract the conversation ID from field 2.
        const conversationId = this.extractStringField(fields, 2);
        // Extract the flags from field 3.
        const flags = this.extractNumberField(fields, 3) ?? 0;
        // Extract audio settings from field 4 (nested message).
        let audioSettings;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const audioSettingsBuffer = fields[4]?.[0];
        if (Buffer.isBuffer(audioSettingsBuffer)) {
            const audioFields = this.decodeProtobuf(audioSettingsBuffer);
            audioSettings = {
                autoGain: this.extractNumberField(audioFields, 2) ?? 0,
                noiseSuppressionLevel: this.extractNumberField(audioFields, 1) ?? 0,
                volumeMultiplier: this.extractTelemetryValue(audioFields, 3) || 1.0
            };
        }
        // Extract wake word phrase from field 5.
        const wakeWordPhrase = this.extractStringField(fields, 5);
        // Emit the voice assistant request event.
        this.emit("voiceAssistantRequest", {
            audioSettings,
            conversationId,
            flags,
            start,
            wakeWordPhrase
        });
        this.log.debug("Voice assistant request - start: " + start + " | conversation: " + conversationId + " | flags: " + flags);
    }
    /**
     * Handle voice assistant announce finished response from the ESPHome device.
     *
     * @param payload - The response payload containing success status.
     */
    handleVoiceAssistantAnnounceFinished(payload) {
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        // Extract the success flag from field 1.
        const success = this.extractBoolField(fields, 1);
        // Emit the announce finished event.
        this.emit("voiceAssistantAnnounceFinished", success);
        this.log.debug("Voice assistant announce finished - success: " + success);
    }
    /**
     * Handle voice assistant configuration response from the ESPHome device.
     *
     * @param payload - The response payload containing configuration data.
     */
    handleVoiceAssistantConfigurationResponse(payload) {
        // Decode the protobuf fields from the payload according to VoiceAssistantConfigurationResponse.
        const fields = this.decodeProtobuf(payload);
        // Extract available wake words from field 1 (repeated VoiceAssistantWakeWord).
        const availableWakeWords = [];
        const wakeWordFields = fields[1];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (wakeWordFields && Array.isArray(wakeWordFields)) {
            for (const wakeWordBuffer of wakeWordFields) {
                if (Buffer.isBuffer(wakeWordBuffer)) {
                    const wakeWordMsg = this.decodeProtobuf(wakeWordBuffer);
                    // Extract wake word fields.
                    const id = this.extractStringField(wakeWordMsg, 1);
                    const wakeWord = this.extractStringField(wakeWordMsg, 2);
                    // Extract trained languages from field 3 (repeated string).
                    const trainedLanguages = [];
                    const langFields = wakeWordMsg[3];
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    if (langFields && Array.isArray(langFields)) {
                        for (const langBuffer of langFields) {
                            if (Buffer.isBuffer(langBuffer)) {
                                trainedLanguages.push(langBuffer.toString("utf8"));
                            }
                        }
                    }
                    if (id && wakeWord) {
                        availableWakeWords.push({ id, trainedLanguages, wakeWord });
                    }
                }
            }
        }
        // Extract active wake words from field 2 (repeated string).
        const activeWakeWords = [];
        const activeFields = fields[2];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (activeFields && Array.isArray(activeFields)) {
            for (const activeBuffer of activeFields) {
                if (Buffer.isBuffer(activeBuffer)) {
                    activeWakeWords.push(activeBuffer.toString("utf8"));
                }
            }
        }
        // Extract max active wake words from field 3.
        const maxActiveWakeWords = this.extractNumberField(fields, 3) ?? 0;
        // Store the configuration.
        this.voiceAssistantConfig = {
            activeWakeWords,
            availableWakeWords,
            maxActiveWakeWords
        };
        // Emit the configuration event.
        this.emit("voiceAssistantConfiguration", this.voiceAssistantConfig);
        this.log.debug("Voice assistant configuration received - available: " + availableWakeWords.length +
            " | active: " + activeWakeWords.length + " | max: " + maxActiveWakeWords);
    }
    /**
     * Handle voice assistant audio data from the ESPHome device.
     *
     * @param payload - The audio data payload.
     */
    handleVoiceAssistantAudio(payload) {
        // Decode the protobuf fields from the payload according to VoiceAssistantAudio.
        const fields = this.decodeProtobuf(payload);
        // Extract audio data from field 1.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const data = fields[1]?.[0];
        if (!Buffer.isBuffer(data)) {
            this.log.warn("Received voice assistant audio without valid data.");
            return;
        }
        // Extract end flag from field 2.
        const end = this.extractBoolField(fields, 2) ?? false;
        // Create the audio data event.
        const audioData = { data, end };
        // Emit the audio data event.
        this.emit("voiceAssistantAudio", audioData);
        this.log.debug("Voice assistant audio received - size: " + data.length + " bytes | end: " + end);
    }
    /**
     * Set a new Noise encryption key on the device. This allows changing the encryption key used for future connections.
     *
     * @param key - The new encryption key (base64 encoded, must decode to exactly 32 bytes).
     *
     * @returns A promise that resolves to true if the key was successfully set, false otherwise.
     *
     * @example
     * ```typescript
     * // Set a new encryption key
     * const success = await client.setNoiseEncryptionKey("newBase64EncodedKey");
     * if (success) {
     *   console.log("Encryption key updated successfully");
     *   // Note: You'll need to reconnect with the new key
     * }
     * ```
     */
    async setNoiseEncryptionKey(key) {
        // Validate the key format.
        const keyBuffer = Buffer.from(key, "base64");
        if (keyBuffer.length !== 32) {
            this.log.error("Invalid encryption key length. Must be exactly 32 bytes when decoded.");
            return false;
        }
        // Build the protobuf fields for the key set request.
        const fields = [
            { fieldNumber: 1, value: keyBuffer, wireType: WireType.LENGTH_DELIMITED }
        ];
        // Create a promise to wait for the response.
        const responsePromise = new Promise((resolve) => {
            this.noiseKeySetResolver = resolve;
            // Set a timeout in case we don't get a response.
            setTimeout(() => {
                if (this.noiseKeySetResolver === resolve) {
                    this.noiseKeySetResolver = null;
                    resolve(false);
                }
            }, 5000);
        });
        // Encode and send the noise encryption key set request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.NOISE_ENCRYPTION_SET_KEY_REQUEST, payload);
        return responsePromise;
    }
    /**
     * Subscribe to log messages from the ESPHome device. This enables real-time log streaming from the device for monitoring and debugging purposes.
     *
     * @param level - The minimum log level to subscribe to (default: LogLevel.INFO). Messages at this level and higher severity will be received.
     * @param dumpConfig - Whether to request a dump of the device configuration (default: false). This provides additional configuration details in the logs.
     *
     * @example
     * ```typescript
     * // Subscribe to INFO level logs and above
     * await client.subscribeToLogs(LogLevel.INFO);
     *
     * // Subscribe to all logs including VERY_VERBOSE
     * await client.subscribeToLogs(LogLevel.VERY_VERBOSE);
     *
     * // Subscribe to ERROR logs only with config dump
     * await client.subscribeToLogs(LogLevel.ERROR, true);
     *
     * // Listen for log events
     * client.on("log", (data) => {
     *   console.log(`[${LogLevel[data.level]}] ${data.message}`);
     * });
     * ```
     */
    subscribeToLogs(level = LogLevel.INFO, dumpConfig = false) {
        this.log.debug("Subscribing to logs at level: " + LogLevel[level] + ", dump config: " + dumpConfig);
        // Build the protobuf fields for the subscription request.
        const fields = [
            { fieldNumber: 1, value: level, wireType: WireType.VARINT },
            { fieldNumber: 2, value: dumpConfig ? 1 : 0, wireType: WireType.VARINT }
        ];
        // Encode the fields and send the subscribe logs request to the device.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.SUBSCRIBE_LOGS_REQUEST, payload);
    }
    /**
     * Handle device info response from the ESPHome device. This extracts all the device metadata from the response message.
     *
     * @param payload - The device info response payload.
     */
    handleDeviceInfoResponse(payload) {
        this.log.debug("Received DeviceInfoResponse");
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        // Build the device info object from the response with all protocol-defined fields.
        const info = {};
        // Extract uses_password (field 1) - bool.
        const usesPasswordValue = this.extractBoolField(fields, 1);
        if (usesPasswordValue !== undefined) {
            info.usesPassword = usesPasswordValue;
        }
        // Extract name (field 2) - string.
        info.name = this.extractStringField(fields, 2);
        // Extract mac_address (field 3) - string.
        info.macAddress = this.extractStringField(fields, 3);
        // Extract esphome_version (field 4) - string.
        info.esphomeVersion = this.extractStringField(fields, 4);
        // Extract compilation_time (field 5) - string.
        info.compilationTime = this.extractStringField(fields, 5);
        // Extract model (field 6) - string.
        info.model = this.extractStringField(fields, 6);
        // Extract has_deep_sleep (field 7) - bool.
        const hasDeepSleepValue = this.extractBoolField(fields, 7);
        if (hasDeepSleepValue !== undefined) {
            info.hasDeepSleep = hasDeepSleepValue;
        }
        // Extract project_name (field 8) - string.
        info.projectName = this.extractStringField(fields, 8);
        // Extract project_version (field 9) - string.
        info.projectVersion = this.extractStringField(fields, 9);
        // Extract webserver_port (field 10) - uint32.
        info.webserverPort = this.extractNumberField(fields, 10);
        // Extract legacy_bluetooth_proxy_version (field 11) - uint32, deprecated.
        info.legacyBluetoothProxyVersion = this.extractNumberField(fields, 11);
        // Extract manufacturer (field 12) - string.
        info.manufacturer = this.extractStringField(fields, 12);
        // Extract friendly_name (field 13) - string.
        info.friendlyName = this.extractStringField(fields, 13);
        // Extract legacy_voice_assistant_version (field 14) - uint32, deprecated.
        info.legacyVoiceAssistantVersion = this.extractNumberField(fields, 14);
        // Extract bluetooth_proxy_feature_flags (field 15) - uint32.
        info.bluetoothProxyFeatureFlags = this.extractNumberField(fields, 15);
        // Extract suggested_area (field 16) - string.
        info.suggestedArea = this.extractStringField(fields, 16);
        // Extract voice_assistant_feature_flags (field 17) - uint32.
        info.voiceAssistantFeatureFlags = this.extractNumberField(fields, 17);
        // Extract bluetooth_mac_address (field 18) - string.
        info.bluetoothMacAddress = this.extractStringField(fields, 18);
        // Extract api_encryption_supported (field 19) - bool.
        const apiEncryptionValue = this.extractBoolField(fields, 19);
        if (apiEncryptionValue !== undefined) {
            info.apiEncryptionSupported = apiEncryptionValue;
        }
        // Note: Fields 20-22 (devices, areas, area) are for more complex setups with multiple devices/areas.
        // These are not commonly used in typical single-device scenarios and would require additional interfaces.
        // Store the remote device info.
        this.remoteDeviceInfo = info;
        this.log.debug("Device info extracted: " + JSON.stringify(info));
    }
    /**
     * Return the device information of the connected ESPHome device if available.
     * Returns a copy of the device information to prevent external mutation.
     *
     * @returns The device information if available, or `null` if not yet received.
     */
    deviceInfo() {
        // Ensure the device information can't be mutated by our caller by returning a shallow copy.
        if (!this.remoteDeviceInfo) {
            return null;
        }
        // Create a shallow copy of the device info to prevent external mutation.
        const infoCopy = {
            apiEncryptionSupported: this.remoteDeviceInfo.apiEncryptionSupported,
            bluetoothMacAddress: this.remoteDeviceInfo.bluetoothMacAddress,
            bluetoothProxyFeatureFlags: this.remoteDeviceInfo.bluetoothProxyFeatureFlags,
            compilationTime: this.remoteDeviceInfo.compilationTime,
            esphomeVersion: this.remoteDeviceInfo.esphomeVersion,
            friendlyName: this.remoteDeviceInfo.friendlyName,
            hasDeepSleep: this.remoteDeviceInfo.hasDeepSleep,
            legacyBluetoothProxyVersion: this.remoteDeviceInfo.legacyBluetoothProxyVersion,
            legacyVoiceAssistantVersion: this.remoteDeviceInfo.legacyVoiceAssistantVersion,
            macAddress: this.remoteDeviceInfo.macAddress,
            manufacturer: this.remoteDeviceInfo.manufacturer,
            model: this.remoteDeviceInfo.model,
            name: this.remoteDeviceInfo.name,
            projectName: this.remoteDeviceInfo.projectName,
            projectVersion: this.remoteDeviceInfo.projectVersion,
            suggestedArea: this.remoteDeviceInfo.suggestedArea,
            usesPassword: this.remoteDeviceInfo.usesPassword,
            voiceAssistantFeatureFlags: this.remoteDeviceInfo.voiceAssistantFeatureFlags,
            webserverPort: this.remoteDeviceInfo.webserverPort
        };
        return infoCopy;
    }
    /**
     * Check if a message type is a list entities response. These messages contain entity discovery information.
     *
     * @param type - The message type to check.
     * @returns `true` if this is a list entities response, `false` otherwise.
     */
    isListEntitiesResponse(type) {
        return ((type >= MessageType.LIST_ENTITIES_BINARY_SENSOR_RESPONSE) && (type <= MessageType.LIST_ENTITIES_TEXT_SENSOR_RESPONSE)) ||
            [MessageType.LIST_ENTITIES_SERVICES_RESPONSE, MessageType.LIST_ENTITIES_CAMERA_RESPONSE, MessageType.LIST_ENTITIES_CLIMATE_RESPONSE,
                MessageType.LIST_ENTITIES_NUMBER_RESPONSE, MessageType.LIST_ENTITIES_SELECT_RESPONSE, MessageType.LIST_ENTITIES_SIREN_RESPONSE,
                MessageType.LIST_ENTITIES_LOCK_RESPONSE, MessageType.LIST_ENTITIES_BUTTON_RESPONSE, MessageType.LIST_ENTITIES_MEDIA_PLAYER_RESPONSE,
                MessageType.LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE, MessageType.LIST_ENTITIES_TEXT_RESPONSE, MessageType.LIST_ENTITIES_DATE_RESPONSE,
                MessageType.LIST_ENTITIES_TIME_RESPONSE, MessageType.LIST_ENTITIES_EVENT_RESPONSE, MessageType.LIST_ENTITIES_VALVE_RESPONSE,
                MessageType.LIST_ENTITIES_DATETIME_RESPONSE, MessageType.LIST_ENTITIES_UPDATE_RESPONSE].includes(type);
    }
    /**
     * Check if a message type is a state update. These messages contain current state information for entities.
     *
     * @param type - The message type to check.
     * @returns `true` if this is a state update message, `false` otherwise.
     */
    isStateUpdate(type) {
        return [MessageType.BINARY_SENSOR_STATE_RESPONSE, MessageType.COVER_STATE_RESPONSE, MessageType.FAN_STATE_RESPONSE, MessageType.LIGHT_STATE_RESPONSE,
            MessageType.SENSOR_STATE_RESPONSE, MessageType.SWITCH_STATE_RESPONSE, MessageType.TEXT_SENSOR_STATE_RESPONSE, MessageType.CLIMATE_STATE_RESPONSE,
            MessageType.NUMBER_STATE_RESPONSE, MessageType.SELECT_STATE_RESPONSE, MessageType.SIREN_STATE_RESPONSE, MessageType.LOCK_STATE_RESPONSE,
            MessageType.BUTTON_COMMAND_REQUEST, MessageType.MEDIA_PLAYER_STATE_RESPONSE, MessageType.ALARM_CONTROL_PANEL_STATE_RESPONSE, MessageType.TEXT_STATE_RESPONSE,
            MessageType.DATE_STATE_RESPONSE, MessageType.TIME_STATE_RESPONSE, MessageType.EVENT_RESPONSE, MessageType.VALVE_STATE_RESPONSE, MessageType.DATETIME_STATE_RESPONSE,
            MessageType.UPDATE_STATE_RESPONSE].includes(type);
    }
    /**
     * Extract entity type label from message type. This converts the message type enum to a lowercase string identifier.
     *
     * @param type - The message type enum value.
     * @returns The entity type label string.
     */
    getEntityTypeLabel(type) {
        return MessageType[type].replace(/^LIST_ENTITIES_/, "").replace(/_RESPONSE$/, "").replace(/_STATE$/, "").toLowerCase();
    }
    /**
     * Get the device_id field number for a given entity list response type. Different entity types have device_id at different field positions.
     *
     * @param type - The message type enum value.
     * @returns The field number for device_id, or undefined if not supported.
     */
    getDeviceIdFieldNumber(type) {
        // Map of message types to their device_id field numbers.
        const deviceIdFields = {
            [MessageType.LIST_ENTITIES_ALARM_CONTROL_PANEL_RESPONSE]: 11,
            [MessageType.LIST_ENTITIES_BINARY_SENSOR_RESPONSE]: 10,
            [MessageType.LIST_ENTITIES_BUTTON_RESPONSE]: 9,
            [MessageType.LIST_ENTITIES_CAMERA_RESPONSE]: 8,
            [MessageType.LIST_ENTITIES_CLIMATE_RESPONSE]: 26,
            [MessageType.LIST_ENTITIES_COVER_RESPONSE]: 13,
            [MessageType.LIST_ENTITIES_DATE_RESPONSE]: 8,
            [MessageType.LIST_ENTITIES_DATETIME_RESPONSE]: 8,
            [MessageType.LIST_ENTITIES_EVENT_RESPONSE]: 10,
            [MessageType.LIST_ENTITIES_FAN_RESPONSE]: 13,
            [MessageType.LIST_ENTITIES_LIGHT_RESPONSE]: 16,
            [MessageType.LIST_ENTITIES_LOCK_RESPONSE]: 12,
            [MessageType.LIST_ENTITIES_MEDIA_PLAYER_RESPONSE]: 10,
            [MessageType.LIST_ENTITIES_NUMBER_RESPONSE]: 14,
            [MessageType.LIST_ENTITIES_SELECT_RESPONSE]: 9,
            [MessageType.LIST_ENTITIES_SENSOR_RESPONSE]: 14,
            [MessageType.LIST_ENTITIES_SIREN_RESPONSE]: 11,
            [MessageType.LIST_ENTITIES_SWITCH_RESPONSE]: 10,
            [MessageType.LIST_ENTITIES_TEXT_RESPONSE]: 12,
            [MessageType.LIST_ENTITIES_TEXT_SENSOR_RESPONSE]: 9,
            [MessageType.LIST_ENTITIES_TIME_RESPONSE]: 8,
            [MessageType.LIST_ENTITIES_UPDATE_RESPONSE]: 9,
            [MessageType.LIST_ENTITIES_VALVE_RESPONSE]: 12
        };
        return deviceIdFields[type];
    }
    /**
     * Get the device_id field number for a given state response type. Some state responses include device_id which we should track.
     *
     * @param type - The message type enum value.
     * @returns The field number for device_id, or undefined if not supported.
     */
    getStateDeviceIdFieldNumber(type) {
        // Map of state response types to their device_id field numbers.
        const stateDeviceIdFields = {
            [MessageType.ALARM_CONTROL_PANEL_STATE_RESPONSE]: 3,
            [MessageType.BINARY_SENSOR_STATE_RESPONSE]: 4,
            [MessageType.CAMERA_IMAGE_RESPONSE]: 4,
            [MessageType.CLIMATE_STATE_RESPONSE]: 16,
            [MessageType.COVER_STATE_RESPONSE]: 6,
            [MessageType.DATE_STATE_RESPONSE]: 6,
            [MessageType.DATETIME_STATE_RESPONSE]: 4,
            [MessageType.EVENT_RESPONSE]: 3,
            [MessageType.FAN_STATE_RESPONSE]: 8,
            [MessageType.LIGHT_STATE_RESPONSE]: 14,
            [MessageType.LOCK_STATE_RESPONSE]: 3,
            [MessageType.MEDIA_PLAYER_STATE_RESPONSE]: 5,
            [MessageType.NUMBER_STATE_RESPONSE]: 4,
            [MessageType.SELECT_STATE_RESPONSE]: 4,
            [MessageType.SENSOR_STATE_RESPONSE]: 4,
            [MessageType.SIREN_STATE_RESPONSE]: 3,
            [MessageType.SWITCH_STATE_RESPONSE]: 3,
            [MessageType.TEXT_SENSOR_STATE_RESPONSE]: 4,
            [MessageType.TEXT_STATE_RESPONSE]: 4,
            [MessageType.TIME_STATE_RESPONSE]: 6,
            [MessageType.UPDATE_STATE_RESPONSE]: 11,
            [MessageType.VALVE_STATE_RESPONSE]: 4
        };
        return stateDeviceIdFields[type];
    }
    /**
     * Parses a single ListEntities*Response, logs it, and stores it. This registers a discovered entity in our internal maps for later reference.
     *
     * @param type - The message type indicating the entity type.
     * @param payload - The entity description payload.
     */
    handleListEntity(type, payload) {
        // Handle user-defined services specially.
        if (type === MessageType.LIST_ENTITIES_SERVICES_RESPONSE) {
            this.handleListServiceEntity(payload);
            return;
        }
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        // Extract and validate the object_id (field 1) - this is the unique identifier.
        const objectId = this.extractStringField(fields, 1);
        if (objectId === undefined) {
            return;
        }
        // Extract and validate the entity key (field 2).
        const key = this.extractFixed32Field(fields, 2);
        if (key === undefined) {
            return;
        }
        // Extract and validate the entity name (field 3) - this is the display name.
        const name = this.extractStringField(fields, 3);
        if (name === undefined) {
            return;
        }
        // Determine the entity type label from the message type enum.
        const label = this.getEntityTypeLabel(type);
        // Extract device_id if present for this entity type.
        const deviceIdFieldNum = this.getDeviceIdFieldNumber(type);
        let deviceId;
        if (deviceIdFieldNum !== undefined) {
            deviceId = this.extractNumberField(fields, deviceIdFieldNum);
        }
        // Store the entity information in our lookup maps.
        // Use object_id instead of name to create the entity ID to avoid collisions.
        const entityId = (label + "-" + objectId).toLowerCase();
        this.entityKeys.set(entityId, key);
        this.entityNames.set(key, name);
        this.entityObjectIds.set(key, objectId);
        this.entityTypes.set(key, label);
        // Store device_id if present.
        if (deviceId !== undefined) {
            this.entityDeviceIds.set(key, deviceId);
        }
        // Create an entity object and add it to our discovered entities list.
        const ent = { key, name, objectId, type: label };
        this.discoveredEntities.push(ent);
        // Log the entity registration for debugging.
        this.log.debug("Registered entity: [" + key + "] " + objectId + " (" + name + ") | type: " + label +
            (deviceId !== undefined ? " | device: " + deviceId : ""));
    }
    /**
     * Handle a ListEntitiesServicesResponse message for user-defined services. This processes service discovery messages and stores service information.
     *
     * @param payload - The service entity description payload.
     */
    handleListServiceEntity(payload) {
        // Decode the protobuf fields from the payload according to ListEntitiesServicesResponse specification.
        const fields = this.decodeProtobuf(payload);
        // Extract the service name from field 1.
        const name = this.extractStringField(fields, 1);
        if (name === undefined) {
            this.log.warn("Received service entity without a name.");
            return;
        }
        // Extract the service key from field 2 (fixed32).
        const key = this.extractFixed32Field(fields, 2);
        if (key === undefined) {
            this.log.warn("Received service entity without a key.");
            return;
        }
        // Extract the service arguments from field 3 (repeated ListEntitiesServicesArgument).
        const args = [];
        const argsFields = fields[3];
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (argsFields && Array.isArray(argsFields)) {
            for (const argBuffer of argsFields) {
                if (Buffer.isBuffer(argBuffer)) {
                    // Decode each argument as a nested protobuf message.
                    const argFields = this.decodeProtobuf(argBuffer);
                    // Extract argument name from field 1.
                    const argName = this.extractStringField(argFields, 1);
                    // Extract argument type from field 2.
                    const argType = this.extractNumberField(argFields, 2);
                    if ((argName !== undefined) && (argType !== undefined)) {
                        args.push({ name: argName, type: argType });
                    }
                }
            }
        }
        // Create the service entity.
        const service = { args, key, name };
        // Store the service in our maps.
        this.services.set(key, service);
        this.discoveredServices.push(service);
        // Log the service registration for debugging.
        this.log.debug("Registered service: [" + key + "] " + name + " with " + args.length + " arguments");
        // Emit a service discovered event.
        this.emit("serviceDiscovered", service);
    }
    /**
     * Decodes a state update, looks up entity info, and emits events. This processes telemetry data from entities and emits appropriate events.
     *
     * @param type - The message type indicating the entity type.
     * @param payload - The state update payload.
     */
    handleTelemetry(type, payload) {
        // Decode the protobuf fields from the payload.
        const fields = this.decodeProtobuf(payload);
        // Extract the entity key from field 1.
        const key = this.extractEntityKey(fields, 1);
        if (key === undefined) {
            return;
        }
        // Look up the entity information using the key.
        const name = this.entityNames.get(key) ?? ("unknown(" + key + ")");
        const typeLabel = this.entityTypes.get(key) ?? this.getEntityTypeLabel(type);
        const eventType = typeLabel.toLowerCase();
        // Check if this state response type includes device_id and store it if present.
        const stateDeviceIdField = this.getStateDeviceIdFieldNumber(type);
        if (stateDeviceIdField !== undefined) {
            const stateDeviceId = this.extractNumberField(fields, stateDeviceIdField);
            if (stateDeviceId !== undefined) {
                // Store or update the device_id for this entity.
                this.entityDeviceIds.set(key, stateDeviceId);
            }
        }
        // Handle different entity types with their specific state structures.
        let data;
        let deviceId, missing, state;
        switch (type) {
            case MessageType.ALARM_CONTROL_PANEL_STATE_RESPONSE:
                state = this.extractNumberField(fields, 2);
                deviceId = this.extractNumberField(fields, 3);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    state,
                    type: "alarm_control_panel"
                };
                break;
            case MessageType.BINARY_SENSOR_STATE_RESPONSE:
                state = this.extractBoolField(fields, 2);
                missing = this.extractBoolField(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    state: state,
                    type: "binary_sensor"
                };
                break;
            case MessageType.BUTTON_COMMAND_REQUEST:
                // We emit a convenience notification to reflect that a button interaction occurred.
                data = {
                    entity: name,
                    key,
                    pressed: true,
                    type: "button"
                };
                break;
            case MessageType.COVER_STATE_RESPONSE:
                data = { ...this.decodeCoverState(fields, eventType, name), key, type: "cover" };
                break;
            case MessageType.FAN_STATE_RESPONSE: {
                state = this.extractBoolField(fields, 2);
                const oscillating = this.extractBoolField(fields, 3);
                const direction = this.extractNumberField(fields, 5);
                const speedLevel = this.extractNumberField(fields, 6);
                const presetMode = this.extractStringField(fields, 7);
                deviceId = this.extractNumberField(fields, 8);
                data = {
                    deviceId,
                    direction,
                    entity: name,
                    key,
                    oscillating: oscillating,
                    presetMode,
                    speedLevel,
                    state: state,
                    type: "fan"
                };
                break;
            }
            case MessageType.CLIMATE_STATE_RESPONSE:
                data = { ...this.decodeClimateState(fields, eventType, name), key, type: "climate" };
                break;
            case MessageType.DATE_STATE_RESPONSE: {
                // Extract date components according to DateStateResponse specification.
                // field 1: key (already extracted)
                // field 2: missing_state (bool)
                // field 3: year (uint32)
                // field 4: month (uint32)
                // field 5: day (uint32)
                // field 6: device_id (uint32)
                missing = this.extractBoolField(fields, 2);
                const year = this.extractNumberField(fields, 3);
                const month = this.extractNumberField(fields, 4);
                const day = this.extractNumberField(fields, 5);
                deviceId = this.extractNumberField(fields, 6);
                data = {
                    day,
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    month,
                    type: "date",
                    year
                };
                break;
            }
            case MessageType.DATETIME_STATE_RESPONSE: {
                // Extract datetime components according to DateTimeStateResponse specification.
                // field 1: key (already extracted)
                // field 2: missing_state (bool)
                // field 3: epoch_seconds (fixed32)
                // field 4: device_id (uint32)
                missing = this.extractBoolField(fields, 2);
                // Extract epoch_seconds as fixed32 (4-byte unsigned integer).
                const epochSeconds = this.extractFixed32Field(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    epochSeconds,
                    key,
                    missingState: missing,
                    type: "datetime"
                };
                break;
            }
            case MessageType.LIGHT_STATE_RESPONSE:
                data = { ...this.decodeLightState(fields, eventType, name), key, type: "light" };
                break;
            case MessageType.LOCK_STATE_RESPONSE:
                state = this.extractNumberField(fields, 2);
                deviceId = this.extractNumberField(fields, 3);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    state,
                    type: "lock"
                };
                break;
            case MessageType.MEDIA_PLAYER_STATE_RESPONSE: {
                state = this.extractNumberField(fields, 2);
                const volume = this.extractTelemetryValue(fields, 3);
                const muted = this.extractBoolField(fields, 4);
                deviceId = this.extractNumberField(fields, 5);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    muted: muted,
                    state,
                    type: "media_player",
                    volume: (typeof volume === "number") ? volume : undefined
                };
                break;
            }
            case MessageType.NUMBER_STATE_RESPONSE:
                state = this.extractTelemetryValue(fields, 2);
                missing = this.extractBoolField(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    state: (typeof state === "number") ? state : undefined,
                    type: "number"
                };
                break;
            case MessageType.SELECT_STATE_RESPONSE:
                state = this.extractStringField(fields, 2);
                missing = this.extractBoolField(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    state,
                    type: "select"
                };
                break;
            case MessageType.SENSOR_STATE_RESPONSE:
                state = this.extractTelemetryValue(fields, 2);
                missing = this.extractBoolField(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    state: (typeof state === "number") ? state : undefined,
                    type: "sensor"
                };
                break;
            case MessageType.SIREN_STATE_RESPONSE:
                state = this.extractBoolField(fields, 2);
                deviceId = this.extractNumberField(fields, 3);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    state: state,
                    type: "siren"
                };
                break;
            case MessageType.SWITCH_STATE_RESPONSE:
                state = this.extractBoolField(fields, 2);
                deviceId = this.extractNumberField(fields, 3);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    state: state,
                    type: "switch"
                };
                break;
            case MessageType.TEXT_SENSOR_STATE_RESPONSE:
                state = this.extractStringField(fields, 2);
                missing = this.extractBoolField(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    state,
                    type: "text_sensor"
                };
                break;
            case MessageType.TEXT_STATE_RESPONSE:
                state = this.extractStringField(fields, 2);
                missing = this.extractBoolField(fields, 3);
                deviceId = this.extractNumberField(fields, 4);
                data = {
                    deviceId,
                    entity: name,
                    key,
                    missingState: missing,
                    state,
                    type: "text"
                };
                break;
            case MessageType.TIME_STATE_RESPONSE: {
                // Extract time components according to TimeStateResponse specification.
                // field 1: key (already extracted)
                // field 2: missing_state (bool)
                // field 3: hour (uint32)
                // field 4: minute (uint32)
                // field 5: second (uint32)
                // field 6: device_id (uint32)
                missing = this.extractBoolField(fields, 2);
                const hour = this.extractNumberField(fields, 3);
                const minute = this.extractNumberField(fields, 4);
                const second = this.extractNumberField(fields, 5);
                deviceId = this.extractNumberField(fields, 6);
                data = {
                    deviceId,
                    entity: name,
                    hour,
                    key,
                    minute,
                    missingState: missing,
                    second,
                    type: "time"
                };
                break;
            }
            case MessageType.UPDATE_STATE_RESPONSE: {
                missing = this.extractBoolField(fields, 2);
                const inProgress = this.extractBoolField(fields, 3);
                const hasProgress = this.extractBoolField(fields, 4);
                const progress = this.extractTelemetryValue(fields, 5);
                const currentVersion = this.extractStringField(fields, 6);
                const latestVersion = this.extractStringField(fields, 7);
                const title = this.extractStringField(fields, 8);
                const releaseSummary = this.extractStringField(fields, 9);
                const releaseUrl = this.extractStringField(fields, 10);
                deviceId = this.extractNumberField(fields, 11);
                data = {
                    currentVersion,
                    deviceId,
                    entity: name,
                    hasProgress: hasProgress,
                    inProgress: inProgress,
                    key,
                    latestVersion,
                    missingState: missing,
                    progress: (typeof progress === "number") ? progress : undefined,
                    releaseSummary,
                    releaseUrl,
                    title,
                    type: "update"
                };
                break;
            }
            case MessageType.VALVE_STATE_RESPONSE:
                data = { ...this.decodeValveState(fields, eventType, name), key, type: "valve" };
                break;
            case MessageType.EVENT_RESPONSE:
                data = { ...this.decodeEventResponse(fields, eventType, name), key, type: "event" };
                break;
            default:
                // We fall back to a best-effort payload that preserves the discriminant and any obvious value at field 2.
                state = this.extractTelemetryValue(fields, 2);
                data = {
                    entity: name,
                    key,
                    type: eventType,
                    ...((typeof state !== "undefined") ? { value: state } : {})
                };
                break;
        }
        // We emit a strongly-typed union on the generic telemetry channel. This is the most flexible subscription path.
        this.emit("telemetry", data);
        // We also emit a per-type channel using the discriminant as the event name. This enables targeted subscriptions.
        this.emit(data.type, data);
        // We keep a concise debug record for quick tracing during development and diagnostics.
        this.log.debug("TYPE: " + data.type + " | data: " + JSON.stringify(data));
    }
    /**
     * Decode cover state telemetry. Cover entities have complex state with position, tilt, and operation status.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    decodeCoverState(fields, eventType, name) {
        // Extract modern cover state fields only - we don't want to support deprecated legacy fields.
        return {
            currentOperation: this.extractNumberField(fields, 5),
            deviceId: this.extractNumberField(fields, 6),
            entity: name,
            position: this.extractTelemetryValue(fields, 3),
            tilt: this.extractTelemetryValue(fields, 4),
            type: eventType
        };
    }
    /**
     * Decode climate state telemetry. Climate entities have the most complex state with multiple temperature values, operating modes, fan settings, and more.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    decodeClimateState(fields, eventType, name) {
        // Extract all the climate-specific fields and build a comprehensive climate state object. Climate entities have many optional fields to represent
        // the full state of an HVAC system including temperatures, modes, fan settings, swing settings, presets, and humidity control.
        return {
            action: this.extractNumberField(fields, 8),
            awayConfig: this.extractBoolField(fields, 7) === true,
            currentHumidity: this.extractTelemetryValue(fields, 14),
            currentTemperature: this.extractTelemetryValue(fields, 3),
            customFanMode: this.extractStringField(fields, 11),
            customPreset: this.extractStringField(fields, 13),
            entity: name,
            fanMode: this.extractNumberField(fields, 9),
            mode: this.extractNumberField(fields, 2),
            preset: this.extractNumberField(fields, 12),
            swingMode: this.extractNumberField(fields, 10),
            targetHumidity: this.extractTelemetryValue(fields, 15),
            targetTemperature: this.extractTelemetryValue(fields, 4),
            targetTemperatureHigh: this.extractTelemetryValue(fields, 6),
            targetTemperatureLow: this.extractTelemetryValue(fields, 5),
            type: eventType
        };
    }
    /**
     * Decode light state telemetry. Light entities have complex state with brightness, colors, color temperature, and effects.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    decodeLightState(fields, eventType, name) {
        // Extract all the light-specific fields and build a comprehensive light state object.
        // According to LightStateResponse specification, device_id is at field 14.
        return {
            blue: this.extractTelemetryValue(fields, 6),
            brightness: this.extractTelemetryValue(fields, 3),
            coldWhite: this.extractTelemetryValue(fields, 12),
            colorBrightness: this.extractTelemetryValue(fields, 10),
            colorMode: this.extractNumberField(fields, 11),
            colorTemperature: this.extractTelemetryValue(fields, 8),
            deviceId: this.extractNumberField(fields, 14),
            effect: this.extractStringField(fields, 9),
            entity: name,
            green: this.extractTelemetryValue(fields, 5),
            red: this.extractTelemetryValue(fields, 4),
            state: this.extractBoolField(fields, 2) === true,
            type: eventType,
            warmWhite: this.extractTelemetryValue(fields, 13),
            white: this.extractTelemetryValue(fields, 7)
        };
    }
    /**
     * Decode valve state telemetry. Valve entities have position and operation status.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    decodeValveState(fields, eventType, name) {
        // Extract valve-specific fields according to ValveStateResponse specification.
        // field 1: key (already extracted)
        // field 2: position (float)
        // field 3: current_operation (ValveOperation enum)
        // field 4: device_id (optional)
        return {
            currentOperation: this.extractNumberField(fields, 3),
            deviceId: this.extractNumberField(fields, 4),
            entity: name,
            position: this.extractTelemetryValue(fields, 2),
            type: eventType
        };
    }
    /**
     * Decode event response telemetry. Event entities represent discrete occurrences with an event type.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    decodeEventResponse(fields, eventType, name) {
        // Extract event fields according to EventResponse specification.
        // field 1: key (already extracted)
        // field 2: event_type (string)
        // field 3: device_id (uint32)
        const eventTypeValue = this.extractStringField(fields, 2);
        const deviceId = this.extractNumberField(fields, 3);
        // Build the event telemetry data object.
        return {
            deviceId,
            entity: name,
            eventType: eventTypeValue,
            type: eventType
        };
    }
    /**
     * Extract entity key from protobuf fields. Entity keys can be encoded as either Buffer or number types.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The entity key or undefined if not found.
     */
    extractEntityKey(fields, fieldNum) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const rawKey = fields[fieldNum]?.[0];
        if (!rawKey) {
            return undefined;
        }
        // Handle both Buffer and number types.
        if (Buffer.isBuffer(rawKey)) {
            return rawKey.readUInt32LE(0);
        }
        if (typeof rawKey === "number") {
            return rawKey;
        }
        return undefined;
    }
    /**
     * Extract fixed32 field from protobuf fields. Fixed32 fields are always 4 bytes and represent 32-bit values.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The numeric value or undefined if not found.
     */
    extractFixed32Field(fields, fieldNum) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const rawBuf = fields[fieldNum]?.[0];
        if (!Buffer.isBuffer(rawBuf) || (rawBuf.length !== FIXED32_SIZE)) {
            return undefined;
        }
        return rawBuf.readUInt32LE(0);
    }
    /**
     * Extract string field from protobuf fields. String fields are encoded as UTF-8 bytes.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The string value or undefined if not found.
     */
    extractStringField(fields, fieldNum) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const rawBuf = fields[fieldNum]?.[0];
        if (!Buffer.isBuffer(rawBuf)) {
            return undefined;
        }
        return rawBuf.toString("utf8");
    }
    /**
     * Extract number field from protobuf fields. Number fields are encoded as varints.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The numeric value or undefined if not found.
     */
    extractNumberField(fields, fieldNum) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const raw = fields[fieldNum]?.[0];
        return (typeof raw === "number") ? raw : undefined;
    }
    /**
     * Extract a boolean field from decoded protobuf fields.
     * Boolean fields are encoded as varints (0 = false, 1 = true).
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The boolean value or undefined if not found.
     */
    extractBoolField(fields, fieldNum) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const raw = fields[fieldNum]?.[0];
        return (typeof raw === "number") ? raw === 1 : undefined;
    }
    /**
     * Parse a single key-value pair buffer.
     */
    parseKeyValuePair(rawBuf) {
        if (!Buffer.isBuffer(rawBuf)) {
            return { key: '', value: '' };
        }
        const result = { key: '', value: '' };
        let offset = 0;
        while (offset < rawBuf.length) {
            const fieldTag = rawBuf[offset++];
            if (fieldTag === 0x0a) { // Field 1: key (wire type 2 = length-delimited)
                const keyLen = rawBuf[offset++];
                result.key = rawBuf.slice(offset, offset + keyLen).toString('utf8');
                offset += keyLen;
            }
            else if (fieldTag === 0x12) { // Field 2: value (wire type 2 = length-delimited)
                const valueLen = rawBuf[offset++];
                result.value = rawBuf.slice(offset, offset + valueLen).toString('utf8');
                offset += valueLen;
            }
            else {
                break;
            }
        }
        return result;
    }
    /**
     * Extract and parse all key-value pairs from a protobuf message field.
     * Parses the embedded protobuf structures containing keys and values,
     * both encoded as length-delimited strings.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns An array of objects with 'key' and 'value' properties, or empty array if not found.
     */
    extractKeyValuePairs(fields, fieldNum) {
        const rawBuffers = fields[fieldNum];
        if (!rawBuffers || !Array.isArray(rawBuffers)) {
            return undefined;
        }
        return rawBuffers.map(rawBuf => this.parseKeyValuePair(rawBuf));
    }
    /**
     * Extract telemetry value from protobuf fields. Telemetry values can be numbers, floats, or strings depending on the entity type.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The telemetry value or undefined if not found.
     */
    extractTelemetryValue(fields, fieldNum) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const valRaw = fields[fieldNum]?.[0];
        if (Buffer.isBuffer(valRaw)) {
            // Interpret 4-byte buffers as float32, others as UTF-8 strings.
            return valRaw.length === FIXED32_SIZE ? valRaw.readFloatLE(0) : valRaw.toString("utf8");
        }
        return valRaw;
    }
    /**
     * Frames a raw protobuf payload with the appropriate framing based on encryption state. This method automatically chooses between encrypted and plaintext framing.
     *
     * @param type - The message type.
     * @param payload - The message payload.
     */
    frameAndSend(type, payload) {
        if ((this.handshakeState === Handshake.READY) && this.noiseClient?.sendCipher) {
            // Use Noise encryption.
            const message = this.serializeNoiseMessage(type, payload);
            const encrypted = this.noiseClient.sendCipher.EncryptWithAd(Buffer.alloc(0), message);
            this.writeNoiseFrame(Buffer.from(encrypted));
        }
        else {
            // Use plaintext framing.
            this.sendPlaintextMessage(type, payload);
        }
    }
    /**
     * Send a plaintext message with standard framing. Plaintext messages use a simple length-prefixed format.
     *
     * @param type - The message type.
     * @param payload - The message payload.
     */
    sendPlaintextMessage(type, payload) {
        // Construct the message header with sentinel, length, and type.
        const header = Buffer.concat([Buffer.from([ProtocolType.PLAINTEXT]), this.encodeVarint(payload.length), this.encodeVarint(type)]);
        // Write the complete framed message to the socket.
        if (this.clientSocket && !this.clientSocket.destroyed) {
            this.clientSocket.write(Buffer.concat([header, payload]));
        }
    }
    /**
     * Encode protobuf fields into a buffer. This creates a protobuf message from field definitions.
     *
     * @param fields - The fields to encode.
     * @returns The encoded protobuf message.
     */
    encodeProtoFields(fields) {
        const parts = [];
        let buf;
        for (const field of fields) {
            // Encode the field tag.
            parts.push(this.encodeVarint((field.fieldNumber << 3) | field.wireType));
            // Encode the field value based on wire type.
            switch (field.wireType) {
                case WireType.VARINT:
                    parts.push(this.encodeVarint(field.value));
                    break;
                case WireType.LENGTH_DELIMITED:
                    buf = field.value;
                    parts.push(this.encodeVarint(buf.length));
                    parts.push(buf);
                    break;
                case WireType.FIXED32:
                    buf = Buffer.alloc(FIXED32_SIZE);
                    if (typeof field.value === "number") {
                        buf.writeUInt32LE(field.value, 0);
                    }
                    else {
                        field.value.copy(buf);
                    }
                    parts.push(buf);
                    break;
            }
        }
        return Buffer.concat(parts);
    }
    /**
     * Build key field as fixed32 for command requests. Entity keys are always sent as fixed32 fields in command messages.
     *
     * @param key - The entity key.
     * @returns The field definition.
     */
    buildKeyField(key) {
        return { fieldNumber: 1, value: key, wireType: WireType.FIXED32 };
    }
    /**
     * Add device_id field to command fields if the entity has one.
     *
     * @param fields - The array of protobuf fields to add to.
     * @param key - The entity key to look up device_id for.
     * @param fieldNumber - The field number to use for device_id.
     */
    addDeviceIdField(fields, key, fieldNumber) {
        const deviceId = this.entityDeviceIds.get(key);
        if (deviceId !== undefined) {
            fields.push({ fieldNumber, value: deviceId, wireType: WireType.VARINT });
        }
    }
    /**
     * Get entity key by ID. This looks up the numeric key for an entity given its string ID.
     *
     * @param id - The entity ID to look up.
     *
     * @returns The entity key or `null` if not found.
     */
    getEntityKey(id) {
        return this.entityKeys.get(id) ?? null;
    }
    /**
     * Log all registered entity IDs for debugging. Logs entities grouped by type with their names and keys. This is primarily a debugging and development tool.
     */
    logAllEntityIds() {
        this.log.warn("Registered Entity IDs:");
        for (const [type, ids] of Object.entries(this.getAvailableEntityIds())) {
            this.log.warn("  " + type + ":");
            for (const id of ids) {
                const entity = this.getEntityById(id);
                if (entity) {
                    this.log.warn("    " + id + " => " + entity.name + " (key: " + entity.key + ")");
                }
            }
        }
    }
    /**
     * Get entity information by ID. This retrieves full entity details given its string ID.
     *
     * @param id - The entity ID to look up.
     *
     * @returns The entity information or `null` if not found.
     */
    getEntityById(id) {
        const key = this.entityKeys.get(id);
        if (!key) {
            return null;
        }
        const name = this.entityNames.get(key);
        const objectId = this.entityObjectIds.get(key);
        const type = this.entityTypes.get(key);
        if (!name || !objectId || !type) {
            return null;
        }
        return { key, name, objectId, type };
    }
    /**
     * Check if an entity ID exists. This is useful for validating entity IDs before sending commands.
     *
     * @param id - The entity ID to check.
     *
     * @returns `true` if the entity exists, `false` otherwise.
     */
    hasEntity(id) {
        return this.entityKeys.has(id);
    }
    /**
     * Get all available entity IDs grouped by type. This provides a structured view of all discovered entities.
     *
     * @returns Object with entity types as keys and arrays of IDs as values.
     */
    getAvailableEntityIds() {
        const result = {};
        for (const id of this.entityKeys.keys()) {
            const type = id.split("-")[0];
            result[type] ??= [];
            result[type].push(id);
        }
        return result;
    }
    /**
     * Get all entities with their IDs. This returns the complete list of entities with their string IDs included.
     *
     * @returns Array of entities with their corresponding IDs.
     */
    getEntitiesWithIds() {
        return this.discoveredEntities.map(entity => {
            const id = (entity.type + "-" + entity.name).replace(/ /g, "_").toLowerCase();
            return { ...entity, id };
        });
    }
    /**
     * Send a ping request to the device to heartbeat the connection. This can be used to keep the connection alive and verify connectivity.
     */
    sendPing() {
        this.frameAndSend(MessageType.PING_REQUEST, Buffer.alloc(0));
    }
    /**
     * Sends a SwitchCommandRequest for the given entity ID and on/off state. This controls binary switch entities like garage door openers.
     *
     * @param id - The entity ID (format: "switch-object_id").
     * @param state - `true` for on, `false` for off.
     */
    sendSwitchCommand(id, state) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendSwitchCommand - ID: " + id + " | KEY: " + key + " | state: " + state);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields.
        const fields = [this.buildKeyField(key), { fieldNumber: 2, value: state ? 1 : 0, wireType: WireType.VARINT }];
        // Add device_id if present (field 3).
        this.addDeviceIdField(fields, key, 3);
        // Encode and send the switch command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.SWITCH_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a ButtonCommandRequest to press a button entity. Button entities trigger one-time actions when pressed.
     *
     * @param id - The entity ID (format: "button-object_id").
     */
    sendButtonCommand(id) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendButtonCommand - ID: " + id + " | KEY: " + key);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields.
        const fields = [this.buildKeyField(key)];
        // Add device_id if present (field 2).
        this.addDeviceIdField(fields, key, 2);
        // Encode and send the button command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.BUTTON_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a CoverCommandRequest for the given entity ID. Cover entities represent things like garage doors, blinds, or shades.
     * This implementation uses modern API semantics only - no deprecated legacy commands.
     *
     * @param id - The entity ID (format: "cover-object_id").
     * @param options - Command options (at least one option must be provided).
     * @param options.stop - Stop the cover movement (optional).
     * @param options.position - Target position 0.0-1.0 where 0 is closed, 1 is open (optional).
     * @param options.tilt - Target tilt 0.0-1.0 where 0 is closed, 1 is open (optional).
     *
     * @example
     * ```typescript
     * // Open fully
     * await client.sendCoverCommand("cover-garage_door_cover", { position: 1.0 });
     *
     * // Close fully
     * await client.sendCoverCommand("cover-garage_door_cover", { position: 0.0 });
     *
     * // Stop movement
     * await client.sendCoverCommand("cover-garage_door_cover", { stop: true });
     *
     * // Set to specific position - 50% open.
     * await client.sendCoverCommand("cover-garage_door_cover", { position: 0.5 });
     *
     * // Set position and tilt for blinds
     * await client.sendCoverCommand("cover-blinds_cover", { position: 1.0, tilt: 0.25 });
     * ```
     */
    sendCoverCommand(id, options) {
        // Validate that at least one option is provided.
        if (!options.stop && (typeof options.position !== "number") && (typeof options.tilt !== "number")) {
            this.log.warn("sendCoverCommand requires at least one option: stop, position, or tilt.");
            return;
        }
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendCoverCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields starting with the entity key.
        const fields = [this.buildKeyField(key)];
        // Add position field if specified (fields 4-5).
        if (typeof options.position === "number") {
            fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT });
            // Create position buffer as float32.
            const positionBuf = Buffer.alloc(FIXED32_SIZE);
            positionBuf.writeFloatLE(options.position, 0);
            fields.push({ fieldNumber: 5, value: positionBuf, wireType: WireType.FIXED32 });
        }
        // Add tilt field if specified (fields 6-7).
        if (typeof options.tilt === "number") {
            fields.push({ fieldNumber: 6, value: 1, wireType: WireType.VARINT });
            // Create tilt buffer as float32.
            const tiltBuf = Buffer.alloc(FIXED32_SIZE);
            tiltBuf.writeFloatLE(options.tilt, 0);
            fields.push({ fieldNumber: 7, value: tiltBuf, wireType: WireType.FIXED32 });
        }
        // Add stop field if specified (field 8).
        if (options.stop) {
            fields.push({ fieldNumber: 8, value: 1, wireType: WireType.VARINT });
        }
        // Add device_id field if available (field 9).
        this.addDeviceIdField(fields, key, 9);
        // Encode and send the cover command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.COVER_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a FanCommandRequest to control a fan entity. Fan entities represent devices that move air with optional speed and oscillation control.
     *
     * @param id - The entity ID (format: "fan-object_id").
     * @param options - Command options (at least one option must be provided).
     * @param options.state - Turn fan on (true) or off (false) (optional).
     * @param options.speedLevel - Fan speed level as an integer (0-100 or device-specific range) (optional).
     * @param options.oscillating - Enable (true) or disable (false) oscillation (optional).
     * @param options.direction - Fan direction: "forward" or "reverse" (optional).
     * @param options.presetMode - Preset mode string (optional).
     *
     * @example
     * ```typescript
     * // Turn on fan at 50% speed
     * await client.sendFanCommand("fan-bedroom_fan", { state: true, speedLevel: 50 });
     *
     * // Turn on oscillation
     * await client.sendFanCommand("fan-bedroom_fan", { oscillating: true });
     *
     * // Set to reverse direction
     * await client.sendFanCommand("fan-ceiling_fan", { direction: "reverse" });
     *
     * // Set preset mode
     * await client.sendFanCommand("fan-bedroom_fan", { presetMode: "sleep" });
     *
     * // Turn off fan
     * await client.sendFanCommand("fan-bedroom_fan", { state: false });
     * ```
     */
    sendFanCommand(id, options) {
        // Validate that at least one option is provided.
        if ((options.state === undefined) && (typeof options.speedLevel !== "number") && (options.oscillating === undefined) && !options.direction && !options.presetMode) {
            this.log.warn("sendFanCommand requires at least one option to be specified");
            return;
        }
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendFanCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields starting with the entity key.
        const fields = [this.buildKeyField(key)];
        // Add state field if specified. This controls whether the fan is on or off.
        if (options.state !== undefined) {
            fields.push({ fieldNumber: 2, value: 1, wireType: WireType.VARINT }, { fieldNumber: 3, value: options.state ? 1 : 0, wireType: WireType.VARINT });
        }
        // Add speed level field if specified. This uses the modern speed_level field (fields 10-11) instead of the deprecated speed field (fields 4-5).
        if (typeof options.speedLevel === "number") {
            fields.push({ fieldNumber: 10, value: 1, wireType: WireType.VARINT }, { fieldNumber: 11, value: options.speedLevel, wireType: WireType.VARINT });
        }
        // Add oscillating field if specified. This controls whether the fan oscillates or remains stationary.
        if (options.oscillating !== undefined) {
            fields.push({ fieldNumber: 6, value: 1, wireType: WireType.VARINT }, { fieldNumber: 7, value: options.oscillating ? 1 : 0, wireType: WireType.VARINT });
        }
        // Add direction field if specified. This controls the rotation direction of the fan blades.
        if (options.direction) {
            const directionMap = { forward: 0, reverse: 1 };
            fields.push({ fieldNumber: 8, value: 1, wireType: WireType.VARINT }, { fieldNumber: 9, value: directionMap[options.direction], wireType: WireType.VARINT });
        }
        // Add preset mode field if specified. This allows selecting predefined fan operating modes.
        if (options.presetMode) {
            const presetBuf = Buffer.from(options.presetMode, "utf8");
            fields.push({ fieldNumber: 12, value: 1, wireType: WireType.VARINT }, { fieldNumber: 13, value: presetBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add device_id field if available (field 14).
        this.addDeviceIdField(fields, key, 14);
        // Encode and send the fan command request. This will update the fan entity on the ESPHome device with all specified parameters.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.FAN_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a comprehensive LightCommandRequest to control all aspects of a light entity. Light entities support various color modes, effects, and transitions.
     *
     * @param id - The entity ID (format: "light-object_id").
     * @param options - Command options.
     * @param options.state - Turn light on (true) or off (false) (optional).
     * @param options.brightness - Brightness level 0.0-1.0 (optional).
     * @param options.colorMode - The color mode to use (see ColorMode enum) (optional).
     * @param options.colorBrightness - Color brightness 0.0-1.0 for RGB modes (optional).
     * @param options.rgb - RGB color values with r, g, b properties 0.0-1.0 (optional).
     * @param options.white - White channel value 0.0-1.0 (optional).
     * @param options.colorTemperature - Color temperature in mireds (optional).
     * @param options.coldWhite - Cold white channel value 0.0-1.0 (optional).
     * @param options.warmWhite - Warm white channel value 0.0-1.0 (optional).
     * @param options.effect - Effect name string (optional).
     * @param options.transitionLength - Transition duration in milliseconds (optional).
     * @param options.flashLength - Flash duration in milliseconds (optional).
     *
     * @example
     * ```typescript
     * // Simple on/off with brightness.
     * await client.sendLightCommand("light-living_room_light", { state: true, brightness: 0.8 });
     *
     * // Set RGB color.
     * await client.sendLightCommand("light-led_strip_light", {
     *   state: true,
     *   colorMode: ColorMode.RGB,
     *   rgb: { r: 1.0, g: 0.0, b: 0.5 },
     *   colorBrightness: 0.9
     * });
     *
     * // Set color temperature to warm white in mireds.
     * await client.sendLightCommand("light-bedroom_light", {
     *   state: true,
     *   colorMode: ColorMode.COLOR_TEMPERATURE,
     *   colorTemperature: 300,
     *   brightness: 0.7
     * });
     *
     * // Set cold/warm white balance.
     * await client.sendLightCommand("light-kitchen_light", {
     *   state: true,
     *   colorMode: ColorMode.COLD_WARM_WHITE,
     *   coldWhite: 0.3,
     *   warmWhite: 0.7
     * });
     *
     * // Apply effect with a 2 second transition.
     * await client.sendLightCommand("light-accent_light", {
     *   state: true,
     *   effect: "rainbow",
     *   transitionLength: 2000
     * });
     *
     * // Flash the light for 500ms.
     * await client.sendLightCommand("light-notification_light", {
     *   state: true,
     *   flashLength: 500
     * });
     * ```
     */
    sendLightCommand(id, options) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendLightCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Start building the protobuf fields.
        const fields = [this.buildKeyField(key)];
        // Add state fields if a state is specified.
        if (options.state !== undefined) {
            fields.push({ fieldNumber: 2, value: 1, wireType: WireType.VARINT }, { fieldNumber: 3, value: options.state ? 1 : 0, wireType: WireType.VARINT });
        }
        // Add brightness fields if brightness is specified.
        if (typeof options.brightness === "number") {
            fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT });
            // Create brightness buffer.
            const brightnessBuf = Buffer.alloc(FIXED32_SIZE);
            brightnessBuf.writeFloatLE(options.brightness, 0);
            fields.push({ fieldNumber: 5, value: brightnessBuf, wireType: WireType.FIXED32 });
        }
        // Add RGB color fields if specified.
        if (options.rgb) {
            fields.push({ fieldNumber: 6, value: 1, wireType: WireType.VARINT });
            // Create buffers for RGB values.
            const redBuf = Buffer.alloc(FIXED32_SIZE);
            const greenBuf = Buffer.alloc(FIXED32_SIZE);
            const blueBuf = Buffer.alloc(FIXED32_SIZE);
            redBuf.writeFloatLE(options.rgb.r, 0);
            greenBuf.writeFloatLE(options.rgb.g, 0);
            blueBuf.writeFloatLE(options.rgb.b, 0);
            fields.push({ fieldNumber: 7, value: redBuf, wireType: WireType.FIXED32 }, { fieldNumber: 8, value: greenBuf, wireType: WireType.FIXED32 }, { fieldNumber: 9, value: blueBuf, wireType: WireType.FIXED32 });
        }
        // Add white channel field if specified.
        if (typeof options.white === "number") {
            fields.push({ fieldNumber: 10, value: 1, wireType: WireType.VARINT });
            const whiteBuf = Buffer.alloc(FIXED32_SIZE);
            whiteBuf.writeFloatLE(options.white, 0);
            fields.push({ fieldNumber: 11, value: whiteBuf, wireType: WireType.FIXED32 });
        }
        // Add color temperature field if specified.
        if (typeof options.colorTemperature === "number") {
            fields.push({ fieldNumber: 12, value: 1, wireType: WireType.VARINT });
            const colorTempBuf = Buffer.alloc(FIXED32_SIZE);
            colorTempBuf.writeFloatLE(options.colorTemperature, 0);
            fields.push({ fieldNumber: 13, value: colorTempBuf, wireType: WireType.FIXED32 });
        }
        // Add transition length field if specified.
        if (typeof options.transitionLength === "number") {
            fields.push({ fieldNumber: 14, value: 1, wireType: WireType.VARINT }, { fieldNumber: 15, value: options.transitionLength, wireType: WireType.VARINT });
        }
        // Add flash length field if specified.
        if (typeof options.flashLength === "number") {
            fields.push({ fieldNumber: 16, value: 1, wireType: WireType.VARINT }, { fieldNumber: 17, value: options.flashLength, wireType: WireType.VARINT });
        }
        // Add effect field if specified.
        if (options.effect) {
            const effectBuf = Buffer.from(options.effect, "utf8");
            fields.push({ fieldNumber: 18, value: 1, wireType: WireType.VARINT }, { fieldNumber: 19, value: effectBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add color brightness field if specified.
        if (typeof options.colorBrightness === "number") {
            fields.push({ fieldNumber: 20, value: 1, wireType: WireType.VARINT });
            const colorBrightBuf = Buffer.alloc(FIXED32_SIZE);
            colorBrightBuf.writeFloatLE(options.colorBrightness, 0);
            fields.push({ fieldNumber: 21, value: colorBrightBuf, wireType: WireType.FIXED32 });
        }
        // Add color mode field if specified.
        if (options.colorMode !== undefined) {
            fields.push({ fieldNumber: 22, value: 1, wireType: WireType.VARINT }, { fieldNumber: 23, value: options.colorMode, wireType: WireType.VARINT });
        }
        // Add cold white field if specified.
        if (typeof options.coldWhite === "number") {
            fields.push({ fieldNumber: 24, value: 1, wireType: WireType.VARINT });
            const coldWhiteBuf = Buffer.alloc(FIXED32_SIZE);
            coldWhiteBuf.writeFloatLE(options.coldWhite, 0);
            fields.push({ fieldNumber: 25, value: coldWhiteBuf, wireType: WireType.FIXED32 });
        }
        // Add warm white field if specified.
        if (typeof options.warmWhite === "number") {
            fields.push({ fieldNumber: 26, value: 1, wireType: WireType.VARINT });
            const warmWhiteBuf = Buffer.alloc(FIXED32_SIZE);
            warmWhiteBuf.writeFloatLE(options.warmWhite, 0);
            fields.push({ fieldNumber: 27, value: warmWhiteBuf, wireType: WireType.FIXED32 });
        }
        // Add device_id field if available (field 28).
        this.addDeviceIdField(fields, key, 28);
        // Encode and send the light command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.LIGHT_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a complete LockCommandRequest to control lock entities. Lock entities support lock, unlock, and open commands with optional codes.
     *
     * @param id - The entity ID (format: "lock-object_id").
     * @param command - The command to send: "lock", "unlock", or "open".
     * @param code - Optional unlock/lock code (optional).
     *
     * @example
     * ```typescript
     * // Lock without code
     * await client.sendLockCommand("lock-front_door_lock", "lock");
     *
     * // Unlock with code
     * await client.sendLockCommand("lock-front_door_lock", "unlock", "1234");
     *
     * // Open (for locks that support it, like gate locks)
     * await client.sendLockCommand("lock-gate_lock", "open", "5678");
     * ```
     */
    sendLockCommand(id, command, code) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendLockCommand - ID: " + id + " | KEY: " + key + " | command: " + command);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Map user-friendly commands to enum values using the LockCommand enum.
        const cmdMap = {
            lock: LockCommand.LOCK,
            open: LockCommand.OPEN,
            unlock: LockCommand.UNLOCK
        };
        // Build the protobuf fields.
        const fields = [
            this.buildKeyField(key),
            { fieldNumber: 2, value: cmdMap[command], wireType: WireType.VARINT }
        ];
        // Add the optional code fields if a code is provided. According to the protocol, we need both has_code and code fields.
        if (code !== undefined) {
            fields.push({ fieldNumber: 3, value: 1, wireType: WireType.VARINT });
            const codeBuf = Buffer.from(code, "utf8");
            fields.push({ fieldNumber: 4, value: codeBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add device_id if present (field 5).
        this.addDeviceIdField(fields, key, 5);
        // Encode and send the lock command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.LOCK_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a ClimateCommandRequest to control a climate/HVAC entity. Climate entities represent heating, ventilation, and air conditioning systems with comprehensive
     * control over temperature, fan modes, swing modes, and operating modes.
     *
     * @param id - The entity ID (format: "climate-object_id").
     * @param options - Command options (at least one option must be provided).
     * @param options.mode - Operating mode: "off", "heat_cool", "cool", "heat", "fan_only", "dry", "auto" (optional).
     * @param options.targetTemperature - Target temperature in the unit configured on the device (optional).
     * @param options.targetTemperatureLow - Low point for heat_cool mode in the unit configured on the device (optional).
     * @param options.targetTemperatureHigh - High point for heat_cool mode in the unit configured on the device (optional).
     * @param options.fanMode - Fan mode: "on", "off", "auto", "low", "medium", "high", "middle", "focus", "diffuse", "quiet" (optional).
     * @param options.swingMode - Swing mode: "off", "both", "vertical", "horizontal" (optional).
     * @param options.customFanMode - Custom fan mode string when using a custom fan configuration (optional).
     * @param options.preset - Preset mode: "none", "home", "away", "boost", "comfort", "eco", "sleep", "activity" (optional).
     * @param options.customPreset - Custom preset string when using a custom preset configuration (optional).
     * @param options.targetHumidity - Target humidity percentage 0-100 (optional).
     *
     * @example
     * ```typescript
     * // Turn on heating to 72°F
     * await client.sendClimateCommand("climate-thermostat_climate", {
     *   mode: "heat",
     *   targetTemperature: 72
     * });
     *
     * // Set to heat_cool mode with temperature range
     * await client.sendClimateCommand("climate-thermostat_climate", {
     *   mode: "heat_cool",
     *   targetTemperatureLow: 68,
     *   targetTemperatureHigh: 76
     * });
     *
     * // Turn on cooling with specific fan and swing settings
     * await client.sendClimateCommand("climate-ac_climate", {
     *   mode: "cool",
     *   targetTemperature: 74,
     *   fanMode: "high",
     *   swingMode: "vertical"
     * });
     *
     * // Set to eco preset
     * await client.sendClimateCommand("climate-thermostat_climate", {
     *   preset: "eco"
     * });
     *
     * // Turn off the climate system
     * await client.sendClimateCommand("climate-thermostat_climate", { mode: "off" });
     *
     * // Set custom fan mode
     * await client.sendClimateCommand("climate-ac_climate", {
     *   customFanMode: "turbo"
     * });
     *
     * // Control humidity along with temperature
     * await client.sendClimateCommand("climate-hvac_climate", {
     *   mode: "auto",
     *   targetTemperature: 72,
     *   targetHumidity: 45
     * });
     * ```
     */
    sendClimateCommand(id, options) {
        // Validate that at least one option is provided. Climate commands must specify at least one parameter to change.
        if (!options.mode && (typeof options.targetTemperature !== "number") && (typeof options.targetTemperatureLow !== "number") &&
            (typeof options.targetTemperatureHigh !== "number") && !options.fanMode && !options.swingMode && !options.customFanMode &&
            !options.preset && !options.customPreset && (typeof options.targetHumidity !== "number")) {
            this.log.warn("sendClimateCommand requires at least one option to be specified.");
            return;
        }
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendClimateCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields starting with the entity key.
        const fields = [this.buildKeyField(key)];
        // Add mode field if specified. The mode controls the primary operating state of the climate device.
        if (options.mode) {
            // Map user-friendly mode names to protocol enum values. These correspond to the ESPHome climate modes.
            const modeMap = {
                /* eslint-disable camelcase */
                auto: ClimateMode.AUTO,
                cool: ClimateMode.COOL,
                dry: ClimateMode.DRY,
                fan_only: ClimateMode.FAN_ONLY,
                heat: ClimateMode.HEAT,
                heat_cool: ClimateMode.HEAT_COOL,
                off: ClimateMode.OFF
                /* eslint-enable camelcase */
            };
            fields.push({ fieldNumber: 2, value: 1, wireType: WireType.VARINT }, { fieldNumber: 3, value: modeMap[options.mode], wireType: WireType.VARINT });
        }
        // Add target temperature field if specified. This sets the desired temperature for single-setpoint modes like heat, cool, or auto.
        if (typeof options.targetTemperature === "number") {
            fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT });
            // Create temperature buffer as float32. Temperature values are sent as floating point to support decimal precision.
            const tempBuf = Buffer.alloc(FIXED32_SIZE);
            tempBuf.writeFloatLE(options.targetTemperature, 0);
            fields.push({ fieldNumber: 5, value: tempBuf, wireType: WireType.FIXED32 });
        }
        // Add target temperature low field if specified. This sets the lower bound for heat_cool mode operation.
        if (typeof options.targetTemperatureLow === "number") {
            fields.push({ fieldNumber: 6, value: 1, wireType: WireType.VARINT });
            // Create temperature buffer as float32 for the low setpoint.
            const tempLowBuf = Buffer.alloc(FIXED32_SIZE);
            tempLowBuf.writeFloatLE(options.targetTemperatureLow, 0);
            fields.push({ fieldNumber: 7, value: tempLowBuf, wireType: WireType.FIXED32 });
        }
        // Add target temperature high field if specified. This sets the upper bound for heat_cool mode operation.
        if (typeof options.targetTemperatureHigh === "number") {
            fields.push({ fieldNumber: 8, value: 1, wireType: WireType.VARINT });
            // Create temperature buffer as float32 for the high setpoint.
            const tempHighBuf = Buffer.alloc(FIXED32_SIZE);
            tempHighBuf.writeFloatLE(options.targetTemperatureHigh, 0);
            fields.push({ fieldNumber: 9, value: tempHighBuf, wireType: WireType.FIXED32 });
        }
        // Add fan mode field if specified. This controls how the fan operates within the climate system.
        if (options.fanMode) {
            // Map user-friendly fan mode names to protocol enum values. These correspond to the ESPHome climate fan modes.
            const fanModeMap = {
                auto: ClimateFanMode.AUTO,
                diffuse: ClimateFanMode.DIFFUSE,
                focus: ClimateFanMode.FOCUS,
                high: ClimateFanMode.HIGH,
                low: ClimateFanMode.LOW,
                medium: ClimateFanMode.MEDIUM,
                middle: ClimateFanMode.MIDDLE,
                off: ClimateFanMode.OFF,
                on: ClimateFanMode.ON,
                quiet: ClimateFanMode.QUIET
            };
            fields.push({ fieldNumber: 12, value: 1, wireType: WireType.VARINT }, { fieldNumber: 13, value: fanModeMap[options.fanMode], wireType: WireType.VARINT });
        }
        // Add swing mode field if specified. This controls the direction of airflow from the climate device.
        if (options.swingMode) {
            // Map user-friendly swing mode names to protocol enum values. These correspond to the ESPHome climate swing modes.
            const swingModeMap = {
                both: ClimateSwingMode.BOTH,
                horizontal: ClimateSwingMode.HORIZONTAL,
                off: ClimateSwingMode.OFF,
                vertical: ClimateSwingMode.VERTICAL
            };
            fields.push({ fieldNumber: 14, value: 1, wireType: WireType.VARINT }, { fieldNumber: 15, value: swingModeMap[options.swingMode], wireType: WireType.VARINT });
        }
        // Add custom fan mode field if specified. This allows setting device-specific fan modes not covered by the standard modes.
        if (options.customFanMode) {
            const customFanBuf = Buffer.from(options.customFanMode, "utf8");
            fields.push({ fieldNumber: 16, value: 1, wireType: WireType.VARINT }, { fieldNumber: 17, value: customFanBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add preset field if specified. Presets are predefined configurations for common scenarios.
        if (options.preset) {
            // Map user-friendly preset names to protocol enum values. These correspond to the ESPHome climate presets.
            const presetMap = {
                activity: ClimatePreset.ACTIVITY,
                away: ClimatePreset.AWAY,
                boost: ClimatePreset.BOOST,
                comfort: ClimatePreset.COMFORT,
                eco: ClimatePreset.ECO,
                home: ClimatePreset.HOME,
                none: ClimatePreset.NONE,
                sleep: ClimatePreset.SLEEP
            };
            fields.push({ fieldNumber: 18, value: 1, wireType: WireType.VARINT }, { fieldNumber: 19, value: presetMap[options.preset], wireType: WireType.VARINT });
        }
        // Add custom preset field if specified. This allows setting device-specific presets not covered by the standard presets.
        if (options.customPreset) {
            const customPresetBuf = Buffer.from(options.customPreset, "utf8");
            fields.push({ fieldNumber: 20, value: 1, wireType: WireType.VARINT }, { fieldNumber: 21, value: customPresetBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add target humidity field if specified. This controls the desired humidity level for climate devices with humidification capabilities.
        if (typeof options.targetHumidity === "number") {
            fields.push({ fieldNumber: 22, value: 1, wireType: WireType.VARINT });
            // Create humidity buffer as float32. Humidity is expressed as a percentage from 0 to 100.
            const humidityBuf = Buffer.alloc(FIXED32_SIZE);
            humidityBuf.writeFloatLE(options.targetHumidity, 0);
            fields.push({ fieldNumber: 23, value: humidityBuf, wireType: WireType.FIXED32 });
        }
        // Add device_id field if available (field 24).
        this.addDeviceIdField(fields, key, 24);
        // Encode and send the climate command request. This will update the climate entity on the ESPHome device with all specified parameters.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.CLIMATE_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a NumberCommandRequest to set the value of a number entity. Number entities represent numeric values that can be adjusted within a defined range.
     *
     * @param id - The entity ID (format: "number-object_id").
     * @param value - The numeric value to set.
     *
     * @example
     * ```typescript
     * // Set a temperature setpoint
     * await client.sendNumberCommand("number-thermostat_setpoint_number", 72.5);
     *
     * // Set a brightness percentage
     * await client.sendNumberCommand("number-brightness_percent_number", 85);
     *
     * // Set a timer duration
     * await client.sendNumberCommand("number-timer_minutes_number", 30);
     * ```
     */
    sendNumberCommand(id, value) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendNumberCommand - ID: " + id + " | KEY: " + key + " | value: " + value);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields. Number commands consist of the entity key and the numeric value to set.
        const fields = [this.buildKeyField(key)];
        // Create a buffer to hold the value as a float32. Number entities in ESPHome use floating point values to support both integers and decimals.
        const valueBuf = Buffer.alloc(FIXED32_SIZE);
        valueBuf.writeFloatLE(value, 0);
        // Add the state field with the value buffer. Field 2 contains the desired numeric value for the entity.
        fields.push({ fieldNumber: 2, value: valueBuf, wireType: WireType.FIXED32 });
        // Add device_id if present (field 3).
        this.addDeviceIdField(fields, key, 3);
        // Encode and send the number command request. This will update the number entity on the ESPHome device to the specified value.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.NUMBER_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a SelectCommandRequest to set the value of a select entity. Select entities represent a choice from a list of predefined options.
     *
     * @param id - The entity ID (format: "select-object_id").
     * @param option - The option string to select.
     *
     * @example
     * ```typescript
     * // Set a mode selection
     * await client.sendSelectCommand("select-hvac_mode_select", "cooling");
     *
     * // Set a fan speed
     * await client.sendSelectCommand("select-fan_speed_select", "high");
     *
     * // Set a preset
     * await client.sendSelectCommand("select-preset_select", "eco");
     * ```
     */
    sendSelectCommand(id, option) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendSelectCommand - ID: " + id + " | KEY: " + key + " | option: " + option);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields. Select commands consist of the entity key and the selected option as a string.
        const fields = [this.buildKeyField(key)];
        // Convert the option string to a buffer for transmission. Select entities use string values to represent the selected option.
        const optionBuf = Buffer.from(option, "utf8");
        // Add the state field with the option buffer. Field 2 contains the desired option string for the entity.
        fields.push({ fieldNumber: 2, value: optionBuf, wireType: WireType.LENGTH_DELIMITED });
        // Add device_id if present (field 3).
        this.addDeviceIdField(fields, key, 3);
        // Encode and send the select command request. This will update the select entity on the ESPHome device to the specified option.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.SELECT_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a TextCommandRequest to set the value of a text input entity. Text entities allow free-form text input within configured constraints.
     *
     * @param id - The entity ID (format: "text-object_id").
     * @param text - The text string to set.
     *
     * @example
     * ```typescript
     * // Set a name field
     * await client.sendTextCommand("text-device_name_text", "Living Room Light");
     *
     * // Set a message
     * await client.sendTextCommand("text-status_message_text", "Away until 6pm");
     *
     * // Set a custom value
     * await client.sendTextCommand("text-custom_field_text", "User defined value");
     * ```
     */
    sendTextCommand(id, text) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendTextCommand - ID: " + id + " | KEY: " + key + " | text: " + text);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields. Text commands consist of the entity key and the text value to set.
        const fields = [this.buildKeyField(key)];
        // Convert the text string to a buffer for transmission. Text entities use UTF-8 encoded strings.
        const textBuf = Buffer.from(text, "utf8");
        // Add the state field with the text buffer. Field 2 contains the desired text value for the entity.
        fields.push({ fieldNumber: 2, value: textBuf, wireType: WireType.LENGTH_DELIMITED });
        // Add device_id if present (field 3).
        this.addDeviceIdField(fields, key, 3);
        // Encode and send the text command request. This will update the text entity on the ESPHome device to the specified value.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.TEXT_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a DateCommandRequest to set the value of a date entity. Date entities represent calendar dates without time information.
     *
     * @param id - The entity ID (format: "date-object_id").
     * @param year - The year (e.g., 2025).
     * @param month - The month (1-12).
     * @param day - The day of month (1-31).
     *
     * @example
     * ```typescript
     * // Set a target date
     * await client.sendDateCommand("date-target_date", 2025, 12, 25);
     *
     * // Set a birthday
     * await client.sendDateCommand("date-birthday", 1990, 5, 15);
     * ```
     */
    sendDateCommand(id, year, month, day) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendDateCommand - ID: " + id + " | KEY: " + key + " | date: " + year + "-" + month + "-" + day);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields. Date commands consist of the entity key and the date components as separate fields.
        const fields = [this.buildKeyField(key)];
        // Add the year field. Field 2 contains the year as a uint32 encoded as varint according to the protocol definition.
        fields.push({ fieldNumber: 2, value: year, wireType: WireType.VARINT });
        // Add the month field. Field 3 contains the month (1-12) as a uint32 encoded as varint.
        fields.push({ fieldNumber: 3, value: month, wireType: WireType.VARINT });
        // Add the day field. Field 4 contains the day of month (1-31) as a uint32 encoded as varint.
        fields.push({ fieldNumber: 4, value: day, wireType: WireType.VARINT });
        // Add device_id if present (field 5).
        this.addDeviceIdField(fields, key, 5);
        // Encode and send the date command request. This will update the date entity on the ESPHome device to the specified date.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.DATE_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a TimeCommandRequest to set the value of a time entity. Time entities represent time of day without date information.
     *
     * @param id - The entity ID (format: "time-object_id").
     * @param hour - The hour (0-23).
     * @param minute - The minute (0-59).
     * @param second - The second (0-59, optional, defaults to 0).
     *
     * @example
     * ```typescript
     * // Set an alarm time
     * await client.sendTimeCommand("time-alarm", 7, 30);
     *
     * // Set a schedule time with seconds
     * await client.sendTimeCommand("time-schedule", 14, 45, 30);
     * ```
     */
    sendTimeCommand(id, hour, minute, second = 0) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendTimeCommand - ID: " + id + " | KEY: " + key + " | time: " + hour + ":" + minute + ":" + second);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields. Time commands consist of the entity key and the time components as separate fields.
        const fields = [this.buildKeyField(key)];
        // Add the hour field. Field 2 contains the hour (0-23) as a uint32 encoded as varint according to the protocol definition.
        fields.push({ fieldNumber: 2, value: hour, wireType: WireType.VARINT });
        // Add the minute field. Field 3 contains the minute (0-59) as a uint32 encoded as varint.
        fields.push({ fieldNumber: 3, value: minute, wireType: WireType.VARINT });
        // Add the second field. Field 4 contains the second (0-59) as a uint32 encoded as varint.
        fields.push({ fieldNumber: 4, value: second, wireType: WireType.VARINT });
        // Add device_id if present (field 5).
        this.addDeviceIdField(fields, key, 5);
        // Encode and send the time command request. This will update the time entity on the ESPHome device to the specified time.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.TIME_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a DateTimeCommandRequest to set the value of a datetime entity. DateTime entities represent both date and time information.
     *
     * @param id - The entity ID (format: "datetime-object_id").
     * @param epochSeconds - The Unix timestamp in seconds.
     *
     * @example
     * ```typescript
     * // Set to current time
     * await client.sendDateTimeCommand("datetime-last_update", Math.floor(Date.now() / 1000));
     *
     * // Set to a specific datetime
     * const targetDate = new Date("2025-12-25T08:00:00");
     * await client.sendDateTimeCommand("datetime-scheduled", Math.floor(targetDate.getTime() / 1000));
     * ```
     */
    sendDateTimeCommand(id, epochSeconds) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendDateTimeCommand - ID: " + id + " | KEY: " + key + " | epochSeconds: " + epochSeconds);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields. DateTime commands consist of the entity key and the Unix timestamp.
        const fields = [this.buildKeyField(key)];
        // Create buffer for epoch seconds as fixed32. The epoch_seconds field is a fixed32 type in the protocol.
        const epochBuf = Buffer.alloc(FIXED32_SIZE);
        epochBuf.writeUInt32LE(epochSeconds, 0);
        // Add the epoch seconds field. Field 2 contains the Unix timestamp as a fixed32 unsigned integer.
        fields.push({ fieldNumber: 2, value: epochBuf, wireType: WireType.FIXED32 });
        // Add device_id if present (field 3).
        this.addDeviceIdField(fields, key, 3);
        // Encode and send the datetime command request. This will update the datetime entity on the ESPHome device to the specified timestamp.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.DATETIME_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a comprehensive MediaPlayerCommandRequest to control all aspects of a media player entity. Media player entities support playback control, volume
     * adjustments, playlist management, and media loading with announcement support.
     *
     * @param id - The entity ID (format: "media_player-object_id").
     * @param options - Command options (at least one option must be provided).
     * @param options.command - Media command from MediaPlayerCommand enum (optional).
     * @param options.volume - Volume level 0.0-1.0 (optional).
     * @param options.mediaUrl - URL of media to play (optional).
     * @param options.announcement - Whether this is an announcement that should interrupt current playback (optional).
     *
     * @example
     * ```typescript
     * // Simple playback control using enum
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   command: MediaPlayerCommand.PLAY
     * });
     *
     * // Pause playback
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   command: MediaPlayerCommand.PAUSE
     * });
     *
     * // Set volume
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   volume: 0.5
     * });
     *
     * // Mute/unmute
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   command: MediaPlayerCommand.MUTE
     * });
     *
     * // Play a specific URL
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   mediaUrl: "http://example.com/music.mp3",
     *   command: MediaPlayerCommand.PLAY
     * });
     *
     * // Play an announcement (interrupts current playback)
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   mediaUrl: "http://example.com/doorbell.mp3",
     *   announcement: true,
     *   volume: 0.8
     * });
     *
     * // Control playlist
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   command: MediaPlayerCommand.REPEAT_ONE
     * });
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   command: MediaPlayerCommand.CLEAR_PLAYLIST
     * });
     *
     * // Turn on/off the media player
     * await client.sendMediaPlayerCommand("media_player-living_room", {
     *   command: MediaPlayerCommand.TURN_ON
     * });
     * ```
     */
    sendMediaPlayerCommand(id, options) {
        // Validate that at least one option is provided.
        if ((options.command === undefined) && (typeof options.volume !== "number") && !options.mediaUrl) {
            this.log.warn("sendMediaPlayerCommand requires at least one option: command, volume, or mediaUrl.");
            return;
        }
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendMediaPlayerCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields starting with the entity key.
        const fields = [this.buildKeyField(key)];
        // Add command field if specified. Media player commands use the MediaPlayerCommand enum directly.
        if (options.command !== undefined) {
            fields.push({ fieldNumber: 2, value: 1, wireType: WireType.VARINT }, { fieldNumber: 3, value: options.command, wireType: WireType.VARINT });
        }
        // Add volume field if specified. Volume is sent as a float32 value between 0.0 and 1.0.
        if (typeof options.volume === "number") {
            fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT });
            // Create volume buffer as float32.
            const volumeBuf = Buffer.alloc(FIXED32_SIZE);
            volumeBuf.writeFloatLE(options.volume, 0);
            fields.push({ fieldNumber: 5, value: volumeBuf, wireType: WireType.FIXED32 });
        }
        // Add media URL field if specified. This allows playing content from a specific URL.
        if (options.mediaUrl) {
            const urlBuf = Buffer.from(options.mediaUrl, "utf8");
            fields.push({ fieldNumber: 6, value: 1, wireType: WireType.VARINT }, { fieldNumber: 7, value: urlBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add announcement field if specified. Announcements interrupt current playback and restore it afterwards.
        if (options.announcement !== undefined) {
            fields.push({ fieldNumber: 8, value: 1, wireType: WireType.VARINT }, { fieldNumber: 9, value: options.announcement ? 1 : 0, wireType: WireType.VARINT });
        }
        // Add device_id if present (field 10).
        this.addDeviceIdField(fields, key, 10);
        // Encode and send the media player command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.MEDIA_PLAYER_COMMAND_REQUEST, payload);
    }
    /**
     * Sends an AlarmControlPanelCommandRequest to control an alarm panel entity. Alarm control panel entities represent security system interfaces.
     *
     * @param id - The entity ID (format: "alarm_control_panel-object_id").
     * @param command - The command: "disarm", "arm_home", "arm_away", "arm_night", "arm_vacation", "arm_custom_bypass", "trigger".
     * @param code - Optional alarm code for arming/disarming (field 3).
     *
     * @example
     * ```typescript
     * // Disarm with code
     * await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "disarm", "1234");
     *
     * // Arm in home mode without code
     * await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "arm_home");
     *
     * // Arm in away mode with code
     * await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "arm_away", "1234");
     *
     * // Trigger alarm (usually for testing)
     * await client.sendAlarmControlPanelCommand("alarm_control_panel-main", "trigger");
     * ```
     */
    sendAlarmControlPanelCommand(id, command, code) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendAlarmControlPanelCommand - ID: " + id + " | KEY: " + key + " | command: " + command + (code ? " | with code" : ""));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Map user-friendly commands to protocol enum values using AlarmControlPanelCommand enum.
        const cmdMap = {
            /* eslint-disable camelcase */
            arm_away: AlarmControlPanelCommand.ARM_AWAY,
            arm_custom_bypass: AlarmControlPanelCommand.ARM_CUSTOM_BYPASS,
            arm_home: AlarmControlPanelCommand.ARM_HOME,
            arm_night: AlarmControlPanelCommand.ARM_NIGHT,
            arm_vacation: AlarmControlPanelCommand.ARM_VACATION,
            disarm: AlarmControlPanelCommand.DISARM,
            trigger: AlarmControlPanelCommand.TRIGGER
            /* eslint-enable camelcase */
        };
        // Build the protobuf fields according to AlarmControlPanelCommandRequest specification.
        const fields = [
            this.buildKeyField(key),
            { fieldNumber: 2, value: cmdMap[command], wireType: WireType.VARINT }
        ];
        // Add the optional code field if provided (field 3: string).
        // Many alarm systems require a code for arming or disarming.
        if ((code !== undefined) && (code !== "")) {
            const codeBuf = Buffer.from(code, "utf8");
            fields.push({ fieldNumber: 3, value: codeBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add device_id if present (field 4).
        this.addDeviceIdField(fields, key, 4);
        // Encode and send the alarm control panel command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.ALARM_CONTROL_PANEL_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a SirenCommandRequest to control a siren entity. Siren entities represent audible or visual alarm devices.
     *
     * @param id - The entity ID (format: "siren-object_id").
     * @param options - Command options.
     * @param options.state - Turn siren on (true) or off (false) (optional).
     * @param options.tone - Siren tone/pattern string to use (optional).
     * @param options.duration - Duration in seconds (uint32) for the siren to sound (optional).
     * @param options.volume - Volume level 0.0-1.0 (optional).
     *
     * @example
     * ```typescript
     * // Turn on siren
     * await client.sendSirenCommand("siren-alarm", { state: true });
     *
     * // Turn on with specific tone and duration
     * await client.sendSirenCommand("siren-alarm", {
     *   state: true,
     *   tone: "burglar",
     *   duration: 30,
     *   volume: 0.8
     * });
     *
     * // Turn off siren
     * await client.sendSirenCommand("siren-alarm", { state: false });
     * ```
     */
    sendSirenCommand(id, options) {
        // Validate that at least one option is provided.
        if ((options.state === undefined) && !options.tone && (typeof options.duration !== "number") && (typeof options.volume !== "number")) {
            this.log.warn("sendSirenCommand requires at least one option: state, tone, duration, or volume.");
            return;
        }
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendSirenCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields starting with the entity key.
        const fields = [this.buildKeyField(key)];
        // Add state field if specified. This controls whether the siren is active or not.
        if (options.state !== undefined) {
            fields.push({ fieldNumber: 2, value: 1, wireType: WireType.VARINT }, { fieldNumber: 3, value: options.state ? 1 : 0, wireType: WireType.VARINT });
        }
        // Add tone field if specified. This selects the siren sound pattern or tone to use.
        if (options.tone) {
            const toneBuf = Buffer.from(options.tone, "utf8");
            fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT }, { fieldNumber: 5, value: toneBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add duration field if specified. This sets how long the siren should sound in seconds as a uint32.
        if (typeof options.duration === "number") {
            fields.push({ fieldNumber: 6, value: 1, wireType: WireType.VARINT }, { fieldNumber: 7, value: Math.round(options.duration), wireType: WireType.VARINT });
        }
        // Add volume field if specified. Volume is sent as a float32 value between 0.0 and 1.0.
        if (typeof options.volume === "number") {
            fields.push({ fieldNumber: 8, value: 1, wireType: WireType.VARINT });
            // Create volume buffer as float32.
            const volumeBuf = Buffer.alloc(FIXED32_SIZE);
            volumeBuf.writeFloatLE(options.volume, 0);
            fields.push({ fieldNumber: 9, value: volumeBuf, wireType: WireType.FIXED32 });
        }
        // Add device_id if present (field 10).
        this.addDeviceIdField(fields, key, 10);
        // Encode and send the siren command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.SIREN_COMMAND_REQUEST, payload);
    }
    /**
     * Sends an UpdateCommandRequest to control an update entity. Update entities represent firmware or software updates that can be installed.
     *
     * @param id - The entity ID (format: "update-object_id").
     * @param command - The command: "update" to install the update, "check" to check for updates, or "none" for no action.
     *
     * @example
     * ```typescript
     * // Check for updates
     * await client.sendUpdateCommand("update-firmware", "check");
     *
     * // Install available update
     * await client.sendUpdateCommand("update-firmware", "update");
     * ```
     */
    sendUpdateCommand(id, command) {
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendUpdateCommand - ID: " + id + " | KEY: " + key + " | command: " + command);
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Map user-friendly commands to protocol enum values. These control the update entity's behavior according to the UpdateCommand enum.
        const cmdMap = { check: 2, none: 0, update: 1 };
        // Build the protobuf fields. Update commands consist of the entity key and the command to execute.
        const fields = [
            this.buildKeyField(key),
            { fieldNumber: 2, value: cmdMap[command], wireType: WireType.VARINT }
        ];
        // Add device_id if present (field 3).
        this.addDeviceIdField(fields, key, 3);
        // Encode and send the update command request. This will trigger the specified update action on the ESPHome device.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.UPDATE_COMMAND_REQUEST, payload);
    }
    /**
     * Sends a CameraImageRequest to capture an image from a camera entity. Camera entities represent image capture devices.
     * Note: Unlike other commands, camera image requests don't target a specific entity - the device will send images from all cameras.
     *
     * @param single - Whether to capture a single image (true) or stream images continuously (false).
     *
     * @example
     * ```typescript
     * // Capture a single image from all cameras
     * await client.sendCameraImageRequest(true);
     *
     * // Start streaming images from all cameras
     * await client.sendCameraImageRequest(false);
     *
     * // Listen for camera images
     * client.on("camera", (data) => {
     *   console.log(`Image from ${data.entity}: ${data.image.length} bytes`);
     *   if (data.done) {
     *     console.log("Image capture complete");
     *   }
     *   // Save image to file
     *   fs.writeFileSync(`camera-${data.entity}.jpg`, data.image);
     * });
     * ```
     */
    sendCameraImageRequest(single) {
        // Log debugging information.
        this.log.debug("sendCameraImageRequest - single: " + single + " | stream: " + !single);
        // Build the protobuf fields according to CameraImageRequest specification. Camera image requests don't have an entity key - they apply to all cameras on the device.
        const fields = [
            { fieldNumber: 1, value: single ? 1 : 0, wireType: WireType.VARINT },
            { fieldNumber: 2, value: single ? 0 : 1, wireType: WireType.VARINT }
        ];
        // Encode and send the camera image request. This will trigger all cameras on the device to capture or stream images. Responses will be received as
        // CAMERA_IMAGE_RESPONSE messages.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.CAMERA_IMAGE_REQUEST, payload);
    }
    /**
     * Sends a ValveCommandRequest for the given entity ID. Valve entities represent controllable valves for fluid or gas flow control.
     *
     * @param id - The entity ID (format: "valve-object_id").
     * @param options - Command options (at least one option must be provided).
     * @param options.position - Target position 0.0-1.0 where 0 is closed, 1 is open (optional).
     * @param options.stop - Stop the valve at its current position (optional).
     *
     * @example
     * ```typescript
     * // Open valve fully
     * await client.sendValveCommand("valve-water_main", { position: 1.0 });
     *
     * // Close valve
     * await client.sendValveCommand("valve-water_main", { position: 0.0 });
     *
     * // Set to 50% open
     * await client.sendValveCommand("valve-water_main", { position: 0.5 });
     *
     * // Stop valve movement
     * await client.sendValveCommand("valve-water_main", { stop: true });
     * ```
     */
    sendValveCommand(id, options) {
        // Validate that at least one option is provided.
        if ((typeof options.position !== "number") && !options.stop) {
            this.log.warn("sendValveCommand requires at least one option: position or stop.");
            return;
        }
        // Look up the entity key using the provided ID.
        const key = this.entityKeys.get(id);
        // Log debugging information.
        this.log.debug("sendValveCommand - ID: " + id + " | KEY: " + key + " | options: " + JSON.stringify(options));
        // Return early if the entity key is not found.
        if (!key) {
            this.log.warn("Entity key not found for ID: " + id + ".");
            return;
        }
        // Build the protobuf fields according to ValveCommandRequest specification.
        const fields = [this.buildKeyField(key)];
        // Add position fields if specified. Position controls how open the valve is from 0.0 (closed) to 1.0 (fully open).
        if (typeof options.position === "number") {
            // Add has_position flag (field 2: bool).
            fields.push({ fieldNumber: 2, value: 1, wireType: WireType.VARINT });
            // Create position buffer as float32 (field 3: float).
            const positionBuf = Buffer.alloc(FIXED32_SIZE);
            positionBuf.writeFloatLE(options.position, 0);
            fields.push({ fieldNumber: 3, value: positionBuf, wireType: WireType.FIXED32 });
        }
        // Add stop field if specified (field 4: bool). This halts the valve at its current position.
        if (options.stop === true) {
            fields.push({ fieldNumber: 4, value: 1, wireType: WireType.VARINT });
        }
        // Add device_id if present (field 5).
        this.addDeviceIdField(fields, key, 5);
        // Encode and send the valve command request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VALVE_COMMAND_REQUEST, payload);
    }
    /**
     * Get the list of discovered user-defined services.
     *
     * @returns An array of discovered service entities.
     *
     * @example
     * ```typescript
     * const services = client.getServices();
     * services.forEach(service => {
     *   console.log(`Service: ${service.name} (key: ${service.key})`);
     *   service.args.forEach(arg => {
     *     console.log(`  - ${arg.name}: ${ServiceArgType[arg.type]}`);
     *   });
     * });
     * ```
     */
    getServices() {
        return [...this.discoveredServices];
    }
    /**
     * Execute a user-defined service on the ESPHome device.
     *
     * @param key - The service key (numeric identifier).
     * @param args - An array of argument values matching the service definition.
     *
     * @example
     * ```typescript
     * // Execute a service with a string and number argument
     * await client.executeService(12345, [
     *   { stringValue: "test" },
     *   { intValue: 42 }
     * ]);
     *
     * // Execute a service with array arguments
     * await client.executeService(54321, [
     *   { boolArray: [true, false, true] },
     *   { floatArray: [1.5, 2.5, 3.5] }
     * ]);
     * ```
     */
    executeService(key, args = []) {
        // Validate the service exists.
        const service = this.services.get(key);
        if (!service) {
            this.log.error("Service with key " + key + " not found.");
            return;
        }
        // Log debugging information.
        this.log.debug("executeService - service: " + service.name + " | key: " + key + " | args: " + args.length);
        // Build the ExecuteServiceRequest message according to the protocol specification.
        const fields = [];
        // Add the service key (field 1: fixed32).
        const keyBuf = Buffer.alloc(FIXED32_SIZE);
        keyBuf.writeUInt32LE(key, 0);
        fields.push({ fieldNumber: 1, value: keyBuf, wireType: WireType.FIXED32 });
        // Add each argument as a nested message (field 2: repeated ExecuteServiceArgument).
        for (let i = 0; i < args.length; i++) {
            const argValue = args[i];
            const argDef = service.args[i];
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (!argDef) {
                this.log.warn("Argument at index " + i + " exceeds service argument definition.");
                continue;
            }
            // Encode the argument based on its type.
            const argFields = [];
            if (argValue.boolValue !== undefined) {
                argFields.push({ fieldNumber: 1, value: argValue.boolValue ? 1 : 0, wireType: WireType.VARINT });
            }
            else if (argValue.intValue !== undefined) {
                // Use field 5 for signed int32 (sint32).
                argFields.push({ fieldNumber: 5, value: this.encodeZigzag(argValue.intValue), wireType: WireType.VARINT });
            }
            else if (argValue.floatValue !== undefined) {
                const floatBuf = Buffer.alloc(FIXED32_SIZE);
                floatBuf.writeFloatLE(argValue.floatValue, 0);
                argFields.push({ fieldNumber: 3, value: floatBuf, wireType: WireType.FIXED32 });
            }
            else if (argValue.stringValue !== undefined) {
                const stringBuf = Buffer.from(argValue.stringValue, "utf8");
                argFields.push({ fieldNumber: 4, value: stringBuf, wireType: WireType.LENGTH_DELIMITED });
            }
            else if (argValue.boolArray !== undefined) {
                for (const val of argValue.boolArray) {
                    argFields.push({ fieldNumber: 6, value: val ? 1 : 0, wireType: WireType.VARINT });
                }
            }
            else if (argValue.intArray !== undefined) {
                for (const val of argValue.intArray) {
                    argFields.push({ fieldNumber: 7, value: this.encodeZigzag(val), wireType: WireType.VARINT });
                }
            }
            else if (argValue.floatArray !== undefined) {
                for (const val of argValue.floatArray) {
                    const floatBuf = Buffer.alloc(FIXED32_SIZE);
                    floatBuf.writeFloatLE(val, 0);
                    argFields.push({ fieldNumber: 8, value: floatBuf, wireType: WireType.FIXED32 });
                }
            }
            else if (argValue.stringArray !== undefined) {
                for (const val of argValue.stringArray) {
                    const stringBuf = Buffer.from(val, "utf8");
                    argFields.push({ fieldNumber: 9, value: stringBuf, wireType: WireType.LENGTH_DELIMITED });
                }
            }
            // Encode the argument as a nested message.
            if (argFields.length > 0) {
                const argPayload = this.encodeProtoFields(argFields);
                fields.push({ fieldNumber: 2, value: argPayload, wireType: WireType.LENGTH_DELIMITED });
            }
        }
        // Encode and send the execute service request.
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.EXECUTE_SERVICE_REQUEST, payload);
    }
    /**
     * Execute a user-defined service on the ESPHome device by name.
     *
     * @param name - The service name.
     * @param args - An array of argument values matching the service definition.
     *
     * @example
     * ```typescript
     * // Execute a service by name
     * await client.executeServiceByName("my_custom_service", [
     *   { stringValue: "test" },
     *   { intValue: 42 }
     * ]);
     * ```
     */
    executeServiceByName(name, args = []) {
        // Find the service by name.
        const service = this.discoveredServices.find(s => s.name === name);
        if (!service) {
            this.log.error("Service with name '" + name + "' not found.");
            return;
        }
        // Execute the service using its key.
        this.executeService(service.key, args);
    }
    /**
     * Subscribe to voice assistant events from the ESPHome device.
     *
     * @param flags - Subscription flags (optional, defaults to NONE).
     *
     * @example
     * ```typescript
     * // Subscribe to voice assistant without audio streaming
     * client.subscribeVoiceAssistant();
     *
     * // Subscribe with audio streaming
     * client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);
     * ```
     */
    subscribeVoiceAssistant(flags = VoiceAssistantSubscribeFlag.NONE) {
        this.log.debug("Subscribing to voice assistant with flags: " + flags);
        // Build the SubscribeVoiceAssistantRequest message.
        const fields = [
            { fieldNumber: 1, value: 1, wireType: WireType.VARINT },
            { fieldNumber: 2, value: flags, wireType: WireType.VARINT }
        ];
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST, payload);
        this.voiceAssistantSubscribed = true;
    }
    /**
     * Unsubscribe from voice assistant events.
     *
     * @example
     * ```typescript
     * client.unsubscribeVoiceAssistant();
     * ```
     */
    unsubscribeVoiceAssistant() {
        this.log.debug("Unsubscribing from voice assistant");
        // Build the SubscribeVoiceAssistantRequest message with subscribe = false.
        const fields = [
            { fieldNumber: 1, value: 0, wireType: WireType.VARINT }
        ];
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.SUBSCRIBE_VOICE_ASSISTANT_REQUEST, payload);
        this.voiceAssistantSubscribed = false;
    }
    /**
     * Send a voice assistant response to the device. Most clients use the API-audio path, and this port-based path is likely going to be deprecated in the future.
     *
     * @param port - The port number for audio streaming (0 for no audio).
     * @param error - Whether an error occurred.
     *
     * @example
     * ```typescript
     * // Respond with audio port
     * client.sendVoiceAssistantResponse(12345, false);
     *
     * // Respond with error
     * client.sendVoiceAssistantResponse(0, true);
     * ```
     */
    sendVoiceAssistantResponse(port, error) {
        this.log.debug("Sending voice assistant response - port: " + port + " | error: " + error);
        // Build the VoiceAssistantResponse message.
        const fields = [];
        // Add port (field 1: uint32).
        fields.push({ fieldNumber: 1, value: port, wireType: WireType.VARINT });
        // Add error flag (field 2: bool).
        fields.push({ fieldNumber: 2, value: error ? 1 : 0, wireType: WireType.VARINT });
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VOICE_ASSISTANT_RESPONSE, payload);
    }
    /**
     * Send a voice assistant event to the device.
     *
     * @param eventType - The type of event.
     * @param data - Optional event data.
     *
     * @example
     * ```typescript
     * // Send run start event
     * client.sendVoiceAssistantEvent(VoiceAssistantEvent.RUN_START);
     *
     * // Send event with data
     * client.sendVoiceAssistantEvent(VoiceAssistantEvent.STT_END, [
     *   { name: "text", value: "Turn on the lights" }
     * ]);
     * ```
     */
    sendVoiceAssistantEvent(eventType, data = []) {
        this.log.debug("Sending voice assistant event - type: " + VoiceAssistantEvent[eventType] + " | data items: " + data.length);
        // Build the VoiceAssistantEventResponse message.
        const fields = [];
        // Add event type (field 1: VoiceAssistantEvent enum).
        fields.push({ fieldNumber: 1, value: eventType, wireType: WireType.VARINT });
        // Add event data (field 2: repeated VoiceAssistantEventData).
        for (const item of data) {
            const dataFields = [];
            // Add name (field 1: string).
            const nameBuf = Buffer.from(item.name, "utf8");
            dataFields.push({ fieldNumber: 1, value: nameBuf, wireType: WireType.LENGTH_DELIMITED });
            // Add value (field 2: string).
            const valueBuf = Buffer.from(item.value, "utf8");
            dataFields.push({ fieldNumber: 2, value: valueBuf, wireType: WireType.LENGTH_DELIMITED });
            // Encode as nested message.
            const dataPayload = this.encodeProtoFields(dataFields);
            fields.push({ fieldNumber: 2, value: dataPayload, wireType: WireType.LENGTH_DELIMITED });
        }
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VOICE_ASSISTANT_EVENT_RESPONSE, payload);
    }
    /**
     * Send voice assistant audio data to the device.
     *
     * @param audioData - The audio data buffer.
     * @param end - Whether this is the last audio packet.
     *
     * @example
     * ```typescript
     * // Send audio chunk
     * client.sendVoiceAssistantAudio(audioBuffer, false);
     *
     * // Send final audio chunk
     * client.sendVoiceAssistantAudio(lastAudioBuffer, true);
     * ```
     */
    sendVoiceAssistantAudio(audioData, end = false) {
        this.log.debug("Sending voice assistant audio - size: " + audioData.length + " bytes | end: " + end);
        // Build the VoiceAssistantAudio message.
        const fields = [];
        // Add audio data (field 1: bytes).
        fields.push({ fieldNumber: 1, value: audioData, wireType: WireType.LENGTH_DELIMITED });
        // Add end flag (field 2: bool).
        fields.push({ fieldNumber: 2, value: end ? 1 : 0, wireType: WireType.VARINT });
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VOICE_ASSISTANT_AUDIO, payload);
    }
    /**
     * Send a voice assistant timer event to the device.
     *
     * @param timerData - The timer event data.
     *
     * @example
     * ```typescript
     * client.sendVoiceAssistantTimerEvent({
     *   eventType: VoiceAssistantTimerEvent.STARTED,
     *   timerId: "timer-123",
     *   name: "Kitchen Timer",
     *   totalSeconds: 300,
     *   secondsLeft: 300,
     *   isActive: true
     * });
     * ```
     */
    sendVoiceAssistantTimerEvent(timerData) {
        this.log.debug("Sending voice assistant timer event - type: " + VoiceAssistantTimerEvent[timerData.eventType] +
            " | timer: " + timerData.timerId);
        // Build the VoiceAssistantTimerEventResponse message.
        const fields = [];
        // Add event type (field 1: VoiceAssistantTimerEvent enum).
        fields.push({ fieldNumber: 1, value: timerData.eventType, wireType: WireType.VARINT });
        // Add timer ID (field 2: string).
        const timerIdBuf = Buffer.from(timerData.timerId, "utf8");
        fields.push({ fieldNumber: 2, value: timerIdBuf, wireType: WireType.LENGTH_DELIMITED });
        // Add name (field 3: string).
        const nameBuf = Buffer.from(timerData.name, "utf8");
        fields.push({ fieldNumber: 3, value: nameBuf, wireType: WireType.LENGTH_DELIMITED });
        // Add total seconds (field 4: uint32).
        fields.push({ fieldNumber: 4, value: timerData.totalSeconds, wireType: WireType.VARINT });
        // Add seconds left (field 5: uint32).
        fields.push({ fieldNumber: 5, value: timerData.secondsLeft, wireType: WireType.VARINT });
        // Add is active flag (field 6: bool).
        fields.push({ fieldNumber: 6, value: timerData.isActive ? 1 : 0, wireType: WireType.VARINT });
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VOICE_ASSISTANT_TIMER_EVENT_RESPONSE, payload);
    }
    /**
     * Request voice assistant configuration from the device.
     *
     * @example
     * ```typescript
     * client.requestVoiceAssistantConfiguration();
     *
     * // Listen for the response
     * client.on("voiceAssistantConfiguration", (config) => {
     *   console.log("Available wake words:", config.availableWakeWords);
     *   console.log("Active wake words:", config.activeWakeWords);
     * });
     * ```
     */
    requestVoiceAssistantConfiguration() {
        this.log.debug("Requesting voice assistant configuration");
        // Send empty VoiceAssistantConfigurationRequest message.
        this.frameAndSend(MessageType.VOICE_ASSISTANT_CONFIGURATION_REQUEST, Buffer.alloc(0));
    }
    /**
     * Set voice assistant configuration on the device.
     *
     * @param activeWakeWords - Array of wake word IDs to activate.
     *
     * @example
     * ```typescript
     * // Set active wake words
     * client.setVoiceAssistantConfiguration(["alexa", "hey_google"]);
     * ```
     */
    setVoiceAssistantConfiguration(activeWakeWords) {
        this.log.debug("Setting voice assistant configuration - active wake words: " + activeWakeWords.join(", "));
        // Build the VoiceAssistantSetConfiguration message.
        const fields = [];
        // Add active wake words (field 1: repeated string).
        for (const wakeWord of activeWakeWords) {
            const wakeWordBuf = Buffer.from(wakeWord, "utf8");
            fields.push({ fieldNumber: 1, value: wakeWordBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VOICE_ASSISTANT_SET_CONFIGURATION, payload);
    }
    /**
     * Send a voice assistant announce request to the device.
     *
     * @param options - The announce options.
     *
     * @example
     * ```typescript
     * // Simple announcement
     * client.sendVoiceAssistantAnnounce({
     *   text: "Dinner is ready"
     * });
     *
     * // Announcement with media and conversation start
     * client.sendVoiceAssistantAnnounce({
     *   mediaId: "doorbell.mp3",
     *   text: "Someone is at the door",
     *   preannounceMediaId: "chime.mp3",
     *   startConversation: true
     * });
     * ```
     */
    sendVoiceAssistantAnnounce(options) {
        this.log.debug("Sending voice assistant announce - text: " + (options.text ?? "none") + " | start conversation: " + (options.startConversation ?? false));
        // Build the VoiceAssistantAnnounceRequest message.
        const fields = [];
        // Add media ID (field 1: string).
        if (options.mediaId) {
            const mediaIdBuf = Buffer.from(options.mediaId, "utf8");
            fields.push({ fieldNumber: 1, value: mediaIdBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add text (field 2: string).
        if (options.text) {
            const textBuf = Buffer.from(options.text, "utf8");
            fields.push({ fieldNumber: 2, value: textBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add preannounce media ID (field 3: string).
        if (options.preannounceMediaId) {
            const preannounceMediaIdBuf = Buffer.from(options.preannounceMediaId, "utf8");
            fields.push({ fieldNumber: 3, value: preannounceMediaIdBuf, wireType: WireType.LENGTH_DELIMITED });
        }
        // Add start conversation flag (field 4: bool).
        if (options.startConversation !== undefined) {
            fields.push({ fieldNumber: 4, value: options.startConversation ? 1 : 0, wireType: WireType.VARINT });
        }
        const payload = this.encodeProtoFields(fields);
        this.frameAndSend(MessageType.VOICE_ASSISTANT_ANNOUNCE_REQUEST, payload);
    }
    /**
     * Get the current voice assistant configuration.
     *
     * @returns The voice assistant configuration or null if not available.
     *
     * @example
     * ```typescript
     * const config = client.getVoiceAssistantConfiguration();
     * if (config) {
     *   console.log("Available wake words:", config.availableWakeWords);
     * }
     * ```
     */
    getVoiceAssistantConfiguration() {
        return this.voiceAssistantConfig;
    }
    /**
     * Check if subscribed to voice assistant.
     *
     * @returns Whether voice assistant subscription is active.
     *
     * @example
     * ```typescript
     * if (client.isVoiceAssistantSubscribed()) {
     *   console.log("Voice assistant is active");
     * }
     * ```
     */
    isVoiceAssistantSubscribed() {
        return this.voiceAssistantSubscribed;
    }
    /**
     * Encode a signed integer using zigzag encoding for efficient protobuf representation.
     *
     * @param value - The signed integer to encode.
     * @returns The zigzag encoded value.
     */
    encodeZigzag(value) {
        return (value << 1) ^ (value >> 31);
    }
    /**
     * Encode an integer as a VarInt (protobuf-style). VarInts use 7 bits per byte with a continuation bit in the MSB.
     *
     * @param value - The value to encode.
     * @returns The encoded varint as a Buffer.
     */
    encodeVarint(value) {
        // Initialize an array to accumulate the encoded bytes.
        const bytes = [];
        // Loop through the value, seven bits at a time, until all bits are consumed.
        for (let v = value;; v >>>= 7) {
            // Extract the lowest 7 bits of the current value chunk.
            const bytePart = v & 0x7F;
            // Determine if there are more bits left beyond this chunk.
            const hasMore = (v >>> 7) !== 0;
            // If there are more chunks, set the MSB (continuation) bit; otherwise leave it clear.
            const byte = hasMore ? (bytePart | 0x80) : bytePart;
            // Append this byte into our buffer array.
            bytes.push(byte);
            // If this was the final chunk (no more bits), exit the loop.
            if (!hasMore) {
                break;
            }
        }
        // Convert the array of byte values into a Buffer and return it.
        return Buffer.from(bytes);
    }
    /**
     * Read a VarInt from buffer at offset; returns [value, bytesRead]. This decodes protobuf-style variable-length integers.
     *
     * @param buffer - The buffer to read from.
     * @param offset - The offset to start reading at.
     * @returns A tuple of [decoded value, number of bytes consumed].
     */
    readVarint(buffer, offset) {
        // Accumulator for the decoded integer result.
        let result = 0;
        // Counter for how many bytes we've consumed.
        let bytesRead = 0;
        // Read byte-by-byte, adding 7 bits at each step, until the continuation bit is clear.
        for (let shift = 0;; shift += 7) {
            // Fetch the next raw byte from the buffer.
            const byte = buffer[offset + bytesRead];
            // Mask off the continuation bit and merge into the result at the correct position.
            result |= (byte & 0x7F) << shift;
            // Advance our byte counter.
            bytesRead++;
            // If the continuation bit (0x80) is not set, we're done.
            if ((byte & 0x80) === 0) {
                break;
            }
        }
        // Return the decoded integer and the number of bytes we consumed.
        return [result, bytesRead];
    }
    /**
     * Decode a simple protobuf message into a map of field numbers to values. This implements basic protobuf decoding for the ESPHome protocol.
     *
     * @param buffer - The protobuf message to decode.
     * @returns A map from field numbers to arrays of decoded values.
     */
    decodeProtobuf(buffer) {
        // Initialize the map from field numbers to arrays of decoded values.
        const fields = {};
        // Iterate through the buffer by manually advancing the offset.
        for (let offset = 0; offset < buffer.length;) {
            let len;
            let lenLen;
            let v;
            let value;
            let vLen;
            // Read the next varint as the tag (combines field number and wire type).
            const [tag, tagLen] = this.readVarint(buffer, offset);
            // Advance past the tag bytes.
            offset += tagLen;
            // Extract the field number (upper bits of tag).
            const fieldNum = tag >>> 3;
            // Extract the wire type (lower 3 bits of tag).
            const wireType = tag & 0x07;
            // Decode the payload based on its wire type.
            switch (wireType) {
                case WireType.VARINT:
                    // Read a varint payload.
                    [v, vLen] = this.readVarint(buffer, offset);
                    // Assign the numeric result.
                    value = v;
                    // Advance past the varint bytes.
                    offset += vLen;
                    break;
                case WireType.FIXED64:
                    // Read a 64-bit little-endian double.
                    value = buffer.readDoubleLE(offset);
                    // Advance by eight bytes.
                    offset += 8;
                    break;
                case WireType.LENGTH_DELIMITED:
                    // Read the length prefix as a varint.
                    [len, lenLen] = this.readVarint(buffer, offset);
                    // Advance past the length prefix.
                    offset += lenLen;
                    // Slice out the next len bytes as a Buffer.
                    value = buffer.subarray(offset, offset + len);
                    // Advance past the length-delimited payload.
                    offset += len;
                    break;
                case WireType.FIXED32:
                    // For 32-bit fields, return the raw bytes for caller interpretation.
                    value = buffer.subarray(offset, offset + 4);
                    // Advance by four bytes.
                    offset += 4;
                    break;
                default:
                    // Warn about unsupported wire types and return what's decoded so far.
                    this.log.warn("Unsupported wire type " + wireType + ".");
                    return fields;
            }
            // Ensure there is an array to hold this field's values.
            fields[fieldNum] ??= [];
            // Append the decoded value for this field.
            fields[fieldNum].push(value);
        }
        // Return the completed map of field numbers to value arrays.
        return fields;
    }
    /**
     * Return whether we are on an encrypted connection or not.
     *
     * @returns `true` if we are on an encrypted connection, `false` otherwise.
     */
    get isEncrypted() {
        return (this.handshakeState === Handshake.READY) && (this.connectionState === ConnectionState.CONNECTED) && this.usingEncryption;
    }
}
//# sourceMappingURL=esphome-client.js.map