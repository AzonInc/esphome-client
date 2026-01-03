/**
 * ESPHome native API client with complete protocol and encryption support.
 *
 * @module esphome-client
 *
 * A comprehensive ESPHome native API client implementation that provides full access to ESPHome devices over TCP connections. This module implements the complete
 * ESPHome native API protocol, including entity discovery, state management, command execution, and real-time telemetry streaming. The client supports both encrypted
 * connections using the Noise protocol and plaintext connections for local network communication.
 *
 * The ESPHome native API operates over TCP on port 6053 by default and uses a binary protocol based on Protocol Buffers. This implementation handles all the protocol
 * complexity internally, providing a clean event-driven interface for interacting with your ESPHome devices. Whether you're controlling lights, reading sensors,
 * managing climate systems, or processing voice assistant requests, this client provides type-safe methods for every ESPHome entity type.
 *
 * ## Key Features
 *
 * - **Automatic Encryption Detection**: The client intelligently detects whether a device supports encryption and adapts accordingly. When provided with an encryption
 *   key, it attempts a secure connection first, falling back to plaintext if the device doesn't support encryption.
 *
 * - **Complete Entity Support**: Every ESPHome entity type is fully supported, from simple switches and sensors to complex climate controls and media players. The
 *   client discovers all entities on connection and provides typed interfaces for controlling them.
 *
 * - **Real-time Telemetry**: Subscribe to state changes and receive immediate updates when any entity changes state. The event-driven architecture ensures you never
 *   miss an update from your devices.
 *
 * - **Voice Assistant Integration**: Full support for ESPHome's voice assistant features, including wake word detection, speech-to-text, and text-to-speech streaming.
 *
 * - **Service Execution**: Execute custom user-defined services on your ESPHome devices with full argument support.
 *
 * - **Robust Error Handling**: Automatic reconnection logic, connection timeout handling, and comprehensive error reporting ensure reliable operation.
 *
 * @example Basic Connection and Control
 * ```typescript
 * import { EspHomeClient } from "./esphome-client";
 *
 * // Create a client instance with optional encryption key.
 * const client = new EspHomeClient({
 *   host: "192.168.1.100",
 *   port: 6053,
 *   encryptionKey: "your-base64-encoded-32-byte-key", // From your ESPHome YAML configuration
 *   clientId: "my-home-automation",
 *   reconnect: true,
 *   reconnectInterval: 15000
 * });
 *
 * // Listen for connection events.
 * client.on("connect", (data) => {
 *   console.log(`Connected to ESPHome device (encrypted: ${data.encrypted})`);
 * });
 *
 * // Discover all entities on the device.
 * client.on("entities", (entities) => {
 *   console.log("Discovered entities:", entities);
 *
 *   // Control a switch entity once discovered.
 *   client.sendSwitchCommand("switch-living_room", true);
 * });
 *
 * // Subscribe to real-time state updates.
 * client.on("switch", (data) => {
 *   console.log(`Switch ${data.entity} is now ${data.state ? "ON" : "OFF"}`);
 * });
 *
 * // Connect to the device.
 * await client.connect();
 * ```
 *
 * @example Sensor Monitoring with Logging
 * ```typescript
 * // Monitor temperature and humidity sensors with debug logging.
 * const client = new EspHomeClient({
 *   host: "weather-station.local",
 *   subscribeLogsLevel: LogLevel.DEBUG
 * });
 *
 * // Track sensor readings.
 * const readings = new Map();
 *
 * client.on("sensor", (data) => {
 *   readings.set(data.entity, data.state);
 *
 *   if (data.entity === "sensor-temperature") {
 *     console.log(`Temperature: ${data.state}°C`);
 *
 *     // Trigger actions based on temperature.
 *     if (data.state > 25) {
 *       client.sendFanCommand("fan-cooling", { state: true, speedLevel: 75 });
 *     }
 *   }
 * });
 *
 * // Monitor device logs for debugging.
 * client.on("log", (data) => {
 *   console.log(`[${LogLevel[data.level]}] ${data.message}`);
 * });
 * ```
 *
 * @example Climate Control Automation
 * ```typescript
 * // Sophisticated climate control with scheduling.
 * const client = new EspHomeClient({ host: "thermostat.local" });
 *
 * client.on("climate", (data) => {
 *   console.log(`HVAC Mode: ${ClimateMode[data.mode]}`);
 *   console.log(`Current: ${data.currentTemperature}°C, Target: ${data.targetTemperature}°C`);
 * });
 *
 * // Set up a daily schedule.
 * function applySchedule(hour: number): void {
 *   if ((hour >= 6) && (hour < 9)) {
 *     // Morning warm-up.
 *     client.sendClimateCommand("climate-thermostat", {
 *       mode: ClimateMode.HEAT,
 *       targetTemperature: 22
 *     });
 *   } else if ((hour >= 22) || (hour < 6)) {
 *     // Night setback.
 *     client.sendClimateCommand("climate-thermostat", {
 *       mode: ClimateMode.HEAT,
 *       targetTemperature: 18
 *     });
 *   }
 * }
 * ```
 *
 * @example Voice Assistant Integration
 * ```typescript
 * // Set up voice assistant with wake word detection.
 * const client = new EspHomeClient({ host: "voice-assistant.local" });
 *
 * // Subscribe to voice assistant events.
 * client.subscribeVoiceAssistant(VoiceAssistantSubscribeFlag.API_AUDIO);
 *
 * client.on("voiceAssistantRequest", (data) => {
 *   console.log(`Voice request started: ${data.conversationId}`);
 *
 *   if (data.start) {
 *     // Start audio streaming on port 12345.
 *     client.sendVoiceAssistantResponse(12345, false);
 *     startAudioStreaming(12345);
 *   }
 * });
 *
 * // Handle voice assistant events.
 * client.on("voiceAssistantEvent", (event) => {
 *   switch (event.eventType) {
 *     case VoiceAssistantEvent.WAKE_WORD_START:
 *       console.log("Wake word detected!");
 *       break;
 *     case VoiceAssistantEvent.STT_END:
 *       console.log(`Recognized: ${event.data?.find(d => d.name === "text")?.value}`);
 *       break;
 *   }
 * });
 * ```
 */
import type { EspHomeLogging, Nullable } from "./types.js";
import { Buffer } from "node:buffer";
import { EventEmitter } from "node:events";
/**
 * Log levels supported by ESPHome for log subscriptions. These control the verbosity of log messages received from the device.
 */
export declare enum LogLevel {
    NONE = 0,
    ERROR = 1,
    WARN = 2,
    INFO = 3,
    DEBUG = 4,
    VERBOSE = 5,
    VERY_VERBOSE = 6
}
/**
 * Climate modes supported by ESPHome climate entities. These define the primary operating state of HVAC systems.
 */
export declare enum ClimateMode {
    OFF = 0,
    HEAT_COOL = 1,
    COOL = 2,
    HEAT = 3,
    FAN_ONLY = 4,
    DRY = 5,
    AUTO = 6
}
/**
 * Climate fan modes supported by ESPHome climate entities. These control how the fan operates within the HVAC system.
 */
export declare enum ClimateFanMode {
    ON = 0,
    OFF = 1,
    AUTO = 2,
    LOW = 3,
    MEDIUM = 4,
    HIGH = 5,
    MIDDLE = 6,
    FOCUS = 7,
    DIFFUSE = 8,
    QUIET = 9
}
/**
 * Climate swing modes supported by ESPHome climate entities. These control the direction of airflow from the HVAC system.
 */
export declare enum ClimateSwingMode {
    OFF = 0,
    BOTH = 1,
    VERTICAL = 2,
    HORIZONTAL = 3
}
/**
 * Climate presets supported by ESPHome climate entities. These are predefined configurations for common scenarios.
 */
export declare enum ClimatePreset {
    NONE = 0,
    HOME = 1,
    AWAY = 2,
    BOOST = 3,
    COMFORT = 4,
    ECO = 5,
    SLEEP = 6,
    ACTIVITY = 7
}
/**
 * Climate actions that indicate the current activity of the HVAC system. These represent what the climate device is actively doing.
 */
export declare enum ClimateAction {
    OFF = 0,
    COOLING = 2,
    HEATING = 3,
    IDLE = 4,
    DRYING = 5,
    FAN = 6
}
/**
 * Valve operation states that indicate the current activity of a valve. These represent what the valve is actively doing.
 */
export declare enum ValveOperation {
    IDLE = 0,
    IS_OPENING = 1,
    IS_CLOSING = 2
}
/**
 * Alarm control panel state commands for controlling the alarm system.
 */
export declare enum AlarmControlPanelCommand {
    DISARM = 0,
    ARM_AWAY = 1,
    ARM_HOME = 2,
    ARM_NIGHT = 3,
    ARM_VACATION = 4,
    ARM_CUSTOM_BYPASS = 5,
    TRIGGER = 6
}
/**
 * Color modes supported by ESPHome light entities. These define the color control capabilities of lights.
 */
export declare enum ColorMode {
    UNKNOWN = 0,
    ON_OFF = 1,
    BRIGHTNESS = 3,
    WHITE = 7,
    COLOR_TEMPERATURE = 11,
    COLD_WARM_WHITE = 19,
    RGB = 35,
    RGB_WHITE = 39,
    RGB_COLOR_TEMPERATURE = 47,
    RGB_COLD_WARM_WHITE = 51
}
/**
 * Media player commands supported by ESPHome media player entities.
 */
export declare enum MediaPlayerCommand {
    PLAY = 0,
    PAUSE = 1,
    STOP = 2,
    MUTE = 3,
    UNMUTE = 4,
    TOGGLE = 5,
    VOLUME_UP = 6,
    VOLUME_DOWN = 7,
    ENQUEUE = 8,
    REPEAT_ONE = 9,
    REPEAT_OFF = 10,
    CLEAR_PLAYLIST = 11,
    TURN_ON = 12,
    TURN_OFF = 13
}
/**
 * Lock commands supported by ESPHome lock entities.
 */
export declare enum LockCommand {
    UNLOCK = 0,
    LOCK = 1,
    OPEN = 2
}
/**
 * Cover operation states indicating what a cover is currently doing.
 */
export declare enum CoverOperation {
    IDLE = 0,
    IS_OPENING = 1,
    IS_CLOSING = 2
}
/**
 * Service argument types supported by ESPHome user-defined services.
 */
export declare enum ServiceArgType {
    BOOL = 0,
    INT = 1,
    FLOAT = 2,
    STRING = 3,
    BOOL_ARRAY = 4,
    INT_ARRAY = 5,
    FLOAT_ARRAY = 6,
    STRING_ARRAY = 7
}
/**
 * Voice assistant subscription flags that control what data is received.
 */
export declare enum VoiceAssistantSubscribeFlag {
    NONE = 0,
    API_AUDIO = 1
}
/**
 * Voice assistant request flags that control how the assistant operates.
 */
export declare enum VoiceAssistantRequestFlag {
    NONE = 0,
    USE_VAD = 1,
    USE_WAKE_WORD = 2
}
/**
 * Voice assistant events that indicate the state of voice processing.
 */
export declare enum VoiceAssistantEvent {
    ERROR = 0,
    RUN_START = 1,
    RUN_END = 2,
    STT_START = 3,
    STT_END = 4,
    INTENT_START = 5,
    INTENT_END = 6,
    TTS_START = 7,
    TTS_END = 8,
    WAKE_WORD_START = 9,
    WAKE_WORD_END = 10,
    STT_VAD_START = 11,
    STT_VAD_END = 12,
    TTS_STREAM_START = 98,
    TTS_STREAM_END = 99,
    INTENT_PROGRESS = 100
}
/**
 * Voice assistant timer events that indicate timer state changes.
 */
export declare enum VoiceAssistantTimerEvent {
    STARTED = 0,
    UPDATED = 1,
    CANCELLED = 2,
    FINISHED = 3
}
/**
 * Represents one entity from the ESPHome device. An entity is any controllable or observable component on the device.
 *
 * @property key - The numeric key identifier for the entity.
 * @property name - The human-readable display name of the entity.
 * @property objectId - The unique object ID of the entity (used for entity IDs).
 * @property type - The type of entity (e.g., "switch", "light", "cover").
 */
export interface Entity {
    key: number;
    name: string;
    objectId: string;
    type: string;
}
/**
 * Represents a user-defined service argument definition.
 *
 * @property name - The name of the argument.
 * @property type - The type of the argument (from ServiceArgType enum).
 */
export interface ServiceArgument {
    name: string;
    type: ServiceArgType;
}
/**
 * Represents a user-defined service entity.
 *
 * @property key - The unique numeric identifier for the service.
 * @property name - The name of the service.
 * @property args - The list of arguments the service accepts.
 */
export interface ServiceEntity {
    key: number;
    name: string;
    args: ServiceArgument[];
}
/**
 * Represents an argument value when executing a service.
 */
export interface ExecuteServiceArgumentValue {
    boolValue?: boolean;
    intValue?: number;
    floatValue?: number;
    stringValue?: string;
    boolArray?: boolean[];
    intArray?: number[];
    floatArray?: number[];
    stringArray?: string[];
}
/**
 * Voice assistant event data that provides additional information about an event.
 *
 * @property name - The name of the event data field.
 * @property value - The value of the event data field.
 */
export interface VoiceAssistantEventData {
    name: string;
    value: string;
}
/**
 * Voice assistant wake word configuration.
 *
 * @property id - The unique identifier for the wake word.
 * @property wakeWord - The wake word phrase.
 * @property trainedLanguages - List of languages the wake word is trained for.
 */
export interface VoiceAssistantWakeWord {
    id: string;
    wakeWord: string;
    trainedLanguages: string[];
}
/**
 * Voice assistant configuration response.
 *
 * @property availableWakeWords - List of available wake words.
 * @property activeWakeWords - List of currently active wake word IDs.
 * @property maxActiveWakeWords - Maximum number of wake words that can be active.
 */
export interface VoiceAssistantConfiguration {
    availableWakeWords: VoiceAssistantWakeWord[];
    activeWakeWords: string[];
    maxActiveWakeWords: number;
}
/**
 * Voice assistant timer event data.
 *
 * @property eventType - The type of timer event.
 * @property timerId - The unique identifier for the timer.
 * @property name - The name of the timer.
 * @property totalSeconds - The total duration of the timer in seconds.
 * @property secondsLeft - The remaining time in seconds.
 * @property isActive - Whether the timer is currently active.
 */
export interface VoiceAssistantTimerEventData {
    eventType: VoiceAssistantTimerEvent;
    timerId: string;
    name: string;
    totalSeconds: number;
    secondsLeft: number;
    isActive: boolean;
}
/**
 * Device information received from the ESPHome device. This structure contains all metadata about the connected ESPHome device.
 *
 * @property usesPassword - Whether the device uses password authentication (field 1).
 * @property name - The name of the node, given by "App.set_name()" (field 2).
 * @property macAddress - The MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 3).
 * @property esphomeVersion - A string describing the ESPHome version (field 4).
 * @property compilationTime - The date of compilation (field 5).
 * @property model - The model of the board (e.g., NodeMCU) (field 6).
 * @property hasDeepSleep - Whether the device has deep sleep configured (field 7).
 * @property projectName - The ESPHome project name if set (field 8).
 * @property projectVersion - The ESPHome project version if set (field 9).
 * @property webserverPort - Port number of the web server if enabled (field 10).
 * @property legacyBluetoothProxyVersion - Legacy Bluetooth proxy version, deprecated (field 11).
 * @property manufacturer - The manufacturer of the device (field 12).
 * @property friendlyName - User-friendly name of the device (field 13).
 * @property legacyVoiceAssistantVersion - Legacy voice assistant version, deprecated (field 14).
 * @property bluetoothProxyFeatureFlags - Bluetooth proxy feature flags (field 15).
 * @property suggestedArea - Suggested area for the device (field 16).
 * @property voiceAssistantFeatureFlags - Voice assistant feature flags (field 17).
 * @property bluetoothMacAddress - The Bluetooth MAC address of the device (format: "AA:BB:CC:DD:EE:FF") (field 18).
 * @property apiEncryptionSupported - Whether the device supports API encryption (field 19).
 */
export interface DeviceInfo {
    usesPassword?: boolean;
    name?: string;
    macAddress?: string;
    esphomeVersion?: string;
    compilationTime?: string;
    model?: string;
    hasDeepSleep?: boolean;
    projectName?: string;
    projectVersion?: string;
    webserverPort?: number;
    legacyBluetoothProxyVersion?: number;
    manufacturer?: string;
    friendlyName?: string;
    legacyVoiceAssistantVersion?: number;
    bluetoothProxyFeatureFlags?: number;
    suggestedArea?: string;
    voiceAssistantFeatureFlags?: number;
    bluetoothMacAddress?: string;
    apiEncryptionSupported?: boolean;
}
/**
 * Message event data. This structure is emitted with the 'message' event for raw protocol messages.
 */
export interface MessageEventData {
    type: number;
    payload: Buffer;
}
/**
 * Telemetry data emitted by the client. This is the base structure for all telemetry events from entities.
 */
interface TelemetryData {
    deviceId?: number;
    entity: string;
    type: string;
    value: number | string | undefined;
}
/**
 * Cover state telemetry data with additional fields. Cover entities have more complex state than simple on/off entities.
 */
interface CoverTelemetryData extends Omit<TelemetryData, "value"> {
    currentOperation?: number;
    position?: number;
    tilt?: number;
}
/**
 * Climate state telemetry data with comprehensive HVAC state information. Climate entities have the most complex state of all entity types.
 */
interface ClimateTelemetryData extends Omit<TelemetryData, "value"> {
    mode?: number;
    currentTemperature?: number | string;
    targetTemperature?: number | string;
    targetTemperatureLow?: number | string;
    targetTemperatureHigh?: number | string;
    awayConfig?: boolean;
    fanMode?: number;
    swingMode?: number;
    customFanMode?: string;
    preset?: number;
    customPreset?: string;
    currentHumidity?: number | string;
    targetHumidity?: number | string;
    action?: number;
    value?: number | string | undefined;
}
/**
 * Valve state telemetry data with position and operation status.
 */
interface ValveTelemetryData extends Omit<TelemetryData, "value"> {
    position?: number | string;
    currentOperation?: number;
    value?: number | string | undefined;
}
/**
 * Light state telemetry data with comprehensive lighting information.
 */
interface LightTelemetryData extends Omit<TelemetryData, "value"> {
    state?: boolean;
    brightness?: number;
    colorMode?: number;
    colorBrightness?: number;
    red?: number;
    green?: number;
    blue?: number;
    white?: number;
    colorTemperature?: number;
    coldWhite?: number;
    warmWhite?: number;
    effect?: string;
    value?: number | string | undefined;
}
/**
 * Event telemetry data for event entities. Events are discrete occurrences that can be monitored.
 */
interface EventTelemetryData extends Omit<TelemetryData, "value"> {
    eventType?: string;
}
/**
 * This union enumerates every telemetry family we currently support. We use these literal strings as the discriminant on the `type` property in every telemetry payload.
 * Doing so allows consumers to narrow by `type` and receive precise typing.
 */
export type TelemetryEventType = "alarm_control_panel" | "binary_sensor" | "button" | "climate" | "cover" | "date" | "datetime" | "event" | "fan" | "light" | "lock" | "media_player" | "number" | "select" | "sensor" | "siren" | "switch" | "text" | "text_sensor" | "time" | "update" | "valve";
/**
 * This base interface captures the fields that are common to every telemetry payload we emit. We intentionally keep the shape minimal and predictable. Consumers can rely
 * on `type` to discriminate, `key` for wire identity, and `entity` for human-readable labeling. We include `deviceId` when a state message provides it on the wire.
 */
export interface TelemetryBaseEvent {
    deviceId?: number;
    entity: string;
    key: number;
    type: TelemetryEventType;
}
/**
 * These simple value-like families provide a single primary state. We expose an optional `missingState` flag when the protocol indicates the state is absent, so
 * consumers can distinguish between "present but falsy" and "not present".
 */
export interface BinarySensorEvent extends TelemetryBaseEvent {
    missingState?: boolean;
    state?: boolean;
    type: "binary_sensor";
}
export interface DateEvent extends TelemetryBaseEvent {
    day?: number;
    missingState?: boolean;
    month?: number;
    type: "date";
    year?: number;
}
export interface DateTimeEvent extends TelemetryBaseEvent {
    epochSeconds?: number;
    missingState?: boolean;
    type: "datetime";
}
export interface NumberEvent extends TelemetryBaseEvent {
    missingState?: boolean;
    state?: number;
    type: "number";
}
export interface SelectEvent extends TelemetryBaseEvent {
    missingState?: boolean;
    state?: string;
    type: "select";
}
export interface SensorEvent extends TelemetryBaseEvent {
    state?: number;
    missingState?: boolean;
    type: "sensor";
}
export interface SwitchEvent extends TelemetryBaseEvent {
    state?: boolean;
    type: "switch";
}
export interface TextEvent extends TelemetryBaseEvent {
    missingState?: boolean;
    state?: string;
    type: "text";
}
export interface TextSensorEvent extends TelemetryBaseEvent {
    missingState?: boolean;
    state?: string;
    type: "text_sensor";
}
export interface TimeEvent extends TelemetryBaseEvent {
    hour?: number;
    minute?: number;
    missingState?: boolean;
    second?: number;
    type: "time";
}
/**
 * These families are already decoded into richer shapes elsewhere in the module. We intersect the decoded shapes with the base event and add the `type` discriminant and
 * the canonical `key`. We omit any `type` field from the decoded shapes to avoid conflicts with our discriminant.
 */
export interface ClimateEvent extends TelemetryBaseEvent, Omit<ClimateTelemetryData, "type"> {
    type: "climate";
}
export interface CoverEvent extends TelemetryBaseEvent, Omit<CoverTelemetryData, "type"> {
    type: "cover";
}
export interface EventEntityEvent extends TelemetryBaseEvent, Omit<EventTelemetryData, "type"> {
    type: "event";
}
export interface LightEvent extends TelemetryBaseEvent, Omit<LightTelemetryData, "type"> {
    type: "light";
}
export interface ValveEvent extends TelemetryBaseEvent, Omit<ValveTelemetryData, "type"> {
    type: "valve";
}
/**
 * These multi-field families are represented with a compact shape at this layer. We can extend them as needed while preserving the discriminant. When the protocol
 * provides supplemental flags or modes, we carry them through verbatim.
 */
export interface AlarmControlPanelEvent extends TelemetryBaseEvent {
    state?: number;
    type: "alarm_control_panel";
}
export interface ButtonEvent extends TelemetryBaseEvent {
    pressed?: boolean;
    type: "button";
}
export interface FanEvent extends TelemetryBaseEvent {
    deviceId?: number;
    direction?: number;
    oscillating?: boolean;
    presetMode?: string;
    speedLevel?: number;
    state?: boolean;
    type: "fan";
}
export interface LockEvent extends TelemetryBaseEvent {
    deviceId?: number;
    state?: number;
    type: "lock";
}
export interface MediaPlayerEvent extends TelemetryBaseEvent {
    deviceId?: number;
    muted?: boolean;
    state?: number;
    type: "media_player";
    volume?: number;
}
export interface SirenEvent extends TelemetryBaseEvent {
    deviceId?: number;
    state?: boolean;
    type: "siren";
}
export interface UpdateEvent extends TelemetryBaseEvent {
    currentVersion?: string;
    deviceId?: number;
    hasProgress?: boolean;
    inProgress?: boolean;
    latestVersion?: string;
    missingState?: boolean;
    progress?: number;
    releaseSummary?: string;
    releaseUrl?: string;
    title?: string;
    type: "update";
}
/**
 * This exported union type represents every telemetry payload we emit. Consumers should narrow on `type` to receive the appropriate interface. This provides strong
 * typing for both the generic "telemetry" channel and per-kind channels.
 */
export type TelemetryEvent = AlarmControlPanelEvent | BinarySensorEvent | ButtonEvent | ClimateEvent | CoverEvent | DateEvent | DateTimeEvent | EventEntityEvent | FanEvent | LightEvent | LockEvent | MediaPlayerEvent | NumberEvent | SelectEvent | SensorEvent | SirenEvent | SwitchEvent | TextEvent | TextSensorEvent | TimeEvent | UpdateEvent | ValveEvent;
/**
 * This interface defines the complete set of events that this client emits. Each key is an event name and each value is the payload type that will be provided to
 * listeners for that event. This map serves as the single source of truth for typed subscriptions and enables strongly typed `.on()` and `.once()` overloads without
 * resorting to `any`.
 */
export interface ClientEventsMap {
    alarm_control_panel: AlarmControlPanelEvent;
    binary_sensor: BinarySensorEvent;
    button: ButtonEvent;
    camera: {
        buffer: Buffer;
        entity: string;
        key: number;
    };
    climate: ClimateEvent;
    connect: {
        encrypted: boolean;
    };
    cover: CoverEvent;
    date: DateEvent;
    datetime: DateTimeEvent;
    deviceInfo: DeviceInfo;
    disconnect: string | undefined;
    entities: Record<string, unknown>;
    event: EventEntityEvent;
    fan: FanEvent;
    heartbeat: {
        uptime?: number;
    };
    light: LightEvent;
    lock: LockEvent;
    log: {
        level: number;
        message: string;
    };
    media_player: MediaPlayerEvent;
    message: MessageEventData;
    noiseKeySet: boolean;
    number: NumberEvent;
    select: SelectEvent;
    sensor: SensorEvent;
    serviceDiscovered: Record<string, unknown>;
    services: Record<string, unknown>;
    siren: SirenEvent;
    switch: SwitchEvent;
    telemetry: TelemetryEvent;
    text: TextEvent;
    text_sensor: TextSensorEvent;
    time: TimeEvent;
    /**
     * This event communicates a server-provided epoch time that is intended for time synchronization. It is deliberately separate from the telemetry "time" channel to
     * avoid event-name collision with a "time" entity update.
     */
    timeSync: number;
    update: UpdateEvent;
    valve: ValveEvent;
    voiceAssistantAnnounceFinished: Record<string, unknown>;
    voiceAssistantAudio: {
        chunk: Buffer;
    };
    voiceAssistantConfiguration: Record<string, unknown>;
    voiceAssistantRequest: Record<string, unknown>;
}
/**
 * Log event data emitted when log messages are received from the ESPHome device. These provide insight into the device's internal operation and debugging information.
 *
 * @property level - The log level of the message (ERROR, WARN, INFO, DEBUG, VERBOSE, VERY_VERBOSE).
 * @property message - The actual log message text.
 * @property sendFailed - Whether sending the log message failed (optional).
 */
export interface LogEventData {
    level: LogLevel;
    message: string;
    sendFailed?: boolean;
}
/**
 * Camera image event emitted when camera images are received from the ESPHome device. These contain the actual image data and name.
 *
 * @property image - The raw image data as a Buffer.
 * @property name - The entity name of the camera.
 */
export interface CameraEventData {
    image: Buffer;
    name: string;
}
/**
 * Configuration options for creating an ESPHome client instance. These options control how the client connects to and communicates with ESPHome devices.
 *
 * @property clientId - Optional client identifier to announce when connecting (default: "esphome-client").
 * @property host - The hostname or IP address of the ESPHome device.
 * @property logger - Optional logging interface for debug and error messages.
 * @property port - The port number for the ESPHome API (default: 6053).
 * @property psk - Optional base64 encoded pre-shared key for Noise encryption.
 * @property serverName - Optional expected server name for validation during encrypted connections.
 */
export interface EspHomeClientOptions {
    clientId?: Nullable<string>;
    host: string;
    logger?: EspHomeLogging;
    port?: number;
    psk?: Nullable<string>;
    serverName?: Nullable<string>;
}
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
export declare class EspHomeClient extends EventEmitter {
    private clientId;
    private clientSocket;
    private dataListener;
    private host;
    private log;
    private port;
    private recvBuffer;
    private remoteDeviceInfo;
    private discoveredEntities;
    private entityKeys;
    private entityNames;
    private entityObjectIds;
    private entityDeviceIds;
    private entityTypes;
    private discoveredServices;
    private services;
    private voiceAssistantSubscribed;
    private voiceAssistantConfig;
    private cameraImageBuffers;
    private encryptionKey;
    private expectedServerName;
    private noiseClient;
    private handshakeState;
    private connectionState;
    private connectionTimer;
    private usingEncryption;
    private noiseKeySetResolver;
    private deviceApiMinorVersion;
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
    constructor(options: EspHomeClientOptions);
    /**
     * Connect to the ESPHome device and start communication. This method initializes a new connection. If an encryption key is provided, it will attempt an encrypted
     * connection first and fall back to plaintext if the device doesn't support encryption. Without an encryption key, only plaintext connections are attempted.
     */
    connect(): void;
    /**
     * Create a new TCP connection to the ESPHome device. This is a separate method to allow reconnection with different protocols when falling back from encrypted to
     * plaintext connections.
     */
    private createConnection;
    /**
     * Internal disconnect method that cleans up resources and emits the disconnect event.
     *
     * @param reason - Optional reason for the disconnection.
     */
    private _disconnect;
    /**
     * Disconnect from the ESPHome device and cleanup resources. This method should be called when you're done communicating with the device.
     */
    disconnect(): void;
    /**
     * Clean up Noise encryption resources.
     */
    private cleanupNoiseResources;
    /**
     * Clear the connection timer if it exists. This prevents timeout callbacks from firing after they're no longer needed.
     */
    private clearConnectionTimer;
    /**
     * Set a connection timer for timeout detection. This helps detect when a connection attempt has stalled.
     *
     * @param timeout - Timeout duration in milliseconds (default: 5000).
     */
    private setConnectionTimer;
    /**
     * Handle connection timeout based on the current connection state. This method determines what to do when a connection attempt times out.
     */
    private handleConnectionTimeout;
    /**
     * Handle a newly connected socket. This method is called when the TCP connection is established.
     */
    private handleConnect;
    /**
     * Initialize the Noise handshake for encrypted connections. This sets up the Noise protocol state and sends the initial handshake message.
     */
    private initializeNoiseHandshake;
    /**
     * Send a hello request to let ESPHome know who we are. This is the initial message sent to establish communication when unencrypted. When encrypted, this is sent
     * after we've established a secure connection.
     */
    private sendHello;
    /**
     * Handle the hello response from the ESPHome device and check protocol version compatibility.
     *
     * @param payload - The hello response payload containing version information.
     */
    private handleHelloResponse;
    /**
     * Handle socket errors by logging appropriate messages and disconnecting.
     *
     * @param err - The socket error that occurred.
     */
    private handleSocketError;
    /**
     * Handle socket closure. If we were trying encryption and the socket closed, it might be because the device doesn't support encryption.
     */
    private handleSocketClose;
    /**
     * Clean up the data listener if it exists.
     */
    private cleanupDataListener;
    /**
     * Handle incoming raw data, frame messages, and dispatch. This method accumulates data and processes complete frames.
     *
     * @param chunk - The incoming data chunk from the socket.
     */
    private handleData;
    /**
     * Process Noise protocol frames. This handles the Noise handshake and encrypted message processing.
     */
    private processNoiseFrames;
    /**
     * Extract a Noise frame from the receive buffer. Noise frames have a specific format: [0x01][size_high][size_low][data...].
     *
     * @returns The frame data or null if incomplete.
     */
    private extractNoiseFrame;
    /**
     * Handle the Noise hello response. This processes the server's protocol selection and validates the server name if configured.
     *
     * @param serverHello - The server hello data.
     */
    private handleNoiseHello;
    /**
     * Handle the Noise handshake response. This completes the Noise handshake and establishes the encrypted channel.
     *
     * @param serverHandshake - The server handshake data.
     */
    private handleNoiseHandshake;
    /**
     * Write a Noise protocol frame. Frames are sent with a specific header format for the Noise protocol.
     *
     * @param frame - The frame data to send.
     */
    private writeNoiseFrame;
    /**
     * Serialize a message for Noise protocol. This creates the message format used within encrypted frames.
     *
     * @param type - The message type.
     * @param payload - The message payload.
     *
     * @returns The serialized message buffer.
     */
    private serializeNoiseMessage;
    /**
     * Deserialize a Noise protocol message. This extracts the message type and payload from the decrypted data.
     *
     * @param buffer - The buffer to deserialize.
     *
     * @returns The message type and payload, or null if invalid.
     */
    private deserializeNoiseMessage;
    /**
     * Process plaintext frames during the handshake phase. This handles unencrypted message processing for devices that don't require encryption.
     */
    private processPlaintextFrames;
    /**
     * Dispatch based on message type. This is the main message router that handles all protocol messages.
     *
     * @param type - The message type identifier.
     * @param payload - The message payload data.
     */
    private handleMessage;
    /**
     * Handle log response messages from the ESPHome device. This processes incoming log messages and emits appropriate events for monitoring and debugging.
     *
     * @param payload - The log response payload containing the log level and message.
     */
    private handleLogResponse;
    /**
     * Handle Home Assistant action request messages from the ESPHome device.
     * This processes incoming requests to execute Home Assistant services or fire events,
     * parsing the protobuf payload and emitting the appropriate event with structured data.
     *
     * @param payload - The protobuf-encoded payload containing either an event or action request.
     *                  Events include: event name and variables.
     *                  Actions include: service name, data, data templates, variables, call ID, and response settings.
     */
    private handleHomeAssistantActionRequest;
    /**
     * Handle camera image response from the ESPHome device. This processes incoming camera images and reassembles multi-packet images before emitting.
     *
     * @param payload - The camera image response payload containing the image data and metadata.
     */
    private handleCameraImageResponse;
    /**
     * Handle noise encryption key set response from the ESPHome device. This processes the response to setting a new encryption key.
     *
     * @param payload - The response payload containing the success status.
     */
    private handleNoiseKeySetResponse;
    /**
     * Handle voice assistant request from the ESPHome device.
     *
     * @param payload - The request payload containing voice assistant settings.
     */
    private handleVoiceAssistantRequest;
    /**
     * Handle voice assistant announce finished response from the ESPHome device.
     *
     * @param payload - The response payload containing success status.
     */
    private handleVoiceAssistantAnnounceFinished;
    /**
     * Handle voice assistant configuration response from the ESPHome device.
     *
     * @param payload - The response payload containing configuration data.
     */
    private handleVoiceAssistantConfigurationResponse;
    /**
     * Handle voice assistant audio data from the ESPHome device.
     *
     * @param payload - The audio data payload.
     */
    private handleVoiceAssistantAudio;
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
    setNoiseEncryptionKey(key: string): Promise<boolean>;
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
    subscribeToLogs(level?: LogLevel, dumpConfig?: boolean): void;
    /**
     * Handle device info response from the ESPHome device. This extracts all the device metadata from the response message.
     *
     * @param payload - The device info response payload.
     */
    private handleDeviceInfoResponse;
    /**
     * Return the device information of the connected ESPHome device if available.
     * Returns a copy of the device information to prevent external mutation.
     *
     * @returns The device information if available, or `null` if not yet received.
     */
    deviceInfo(): Nullable<DeviceInfo>;
    /**
     * Check if a message type is a list entities response. These messages contain entity discovery information.
     *
     * @param type - The message type to check.
     * @returns `true` if this is a list entities response, `false` otherwise.
     */
    private isListEntitiesResponse;
    /**
     * Check if a message type is a state update. These messages contain current state information for entities.
     *
     * @param type - The message type to check.
     * @returns `true` if this is a state update message, `false` otherwise.
     */
    private isStateUpdate;
    /**
     * Extract entity type label from message type. This converts the message type enum to a lowercase string identifier.
     *
     * @param type - The message type enum value.
     * @returns The entity type label string.
     */
    private getEntityTypeLabel;
    /**
     * Get the device_id field number for a given entity list response type. Different entity types have device_id at different field positions.
     *
     * @param type - The message type enum value.
     * @returns The field number for device_id, or undefined if not supported.
     */
    private getDeviceIdFieldNumber;
    /**
     * Get the device_id field number for a given state response type. Some state responses include device_id which we should track.
     *
     * @param type - The message type enum value.
     * @returns The field number for device_id, or undefined if not supported.
     */
    private getStateDeviceIdFieldNumber;
    /**
     * Parses a single ListEntities*Response, logs it, and stores it. This registers a discovered entity in our internal maps for later reference.
     *
     * @param type - The message type indicating the entity type.
     * @param payload - The entity description payload.
     */
    private handleListEntity;
    /**
     * Handle a ListEntitiesServicesResponse message for user-defined services. This processes service discovery messages and stores service information.
     *
     * @param payload - The service entity description payload.
     */
    private handleListServiceEntity;
    /**
     * Decodes a state update, looks up entity info, and emits events. This processes telemetry data from entities and emits appropriate events.
     *
     * @param type - The message type indicating the entity type.
     * @param payload - The state update payload.
     */
    private handleTelemetry;
    /**
     * Decode cover state telemetry. Cover entities have complex state with position, tilt, and operation status.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    private decodeCoverState;
    /**
     * Decode climate state telemetry. Climate entities have the most complex state with multiple temperature values, operating modes, fan settings, and more.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    private decodeClimateState;
    /**
     * Decode light state telemetry. Light entities have complex state with brightness, colors, color temperature, and effects.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    private decodeLightState;
    /**
     * Decode valve state telemetry. Valve entities have position and operation status.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    private decodeValveState;
    /**
     * Decode event response telemetry. Event entities represent discrete occurrences with an event type.
     *
     * @param fields - The decoded protobuf fields.
     * @param eventType - The event type string.
     * @param name - The entity name.
     */
    private decodeEventResponse;
    /**
     * Extract entity key from protobuf fields. Entity keys can be encoded as either Buffer or number types.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The entity key or undefined if not found.
     */
    private extractEntityKey;
    /**
     * Extract fixed32 field from protobuf fields. Fixed32 fields are always 4 bytes and represent 32-bit values.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The numeric value or undefined if not found.
     */
    private extractFixed32Field;
    /**
     * Extract string field from protobuf fields. String fields are encoded as UTF-8 bytes.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The string value or undefined if not found.
     */
    private extractStringField;
    /**
     * Extract number field from protobuf fields. Number fields are encoded as varints.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The numeric value or undefined if not found.
     */
    private extractNumberField;
    /**
     * Extract a boolean field from decoded protobuf fields.
     * Boolean fields are encoded as varints (0 = false, 1 = true).
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The boolean value or undefined if not found.
     */
    private extractBoolField;
    /**
     * Parse a single key-value pair buffer.
     */
    private parseKeyValuePair;
    /**
     * Extract and parse all key-value pairs from a protobuf message field.
     * Parses the embedded protobuf structures containing keys and values,
     * both encoded as length-delimited strings.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns An array of objects with 'key' and 'value' properties, or empty array if not found.
     */
    private extractKeyValuePairs;
    /**
     * Extract telemetry value from protobuf fields. Telemetry values can be numbers, floats, or strings depending on the entity type.
     *
     * @param fields - The decoded protobuf fields.
     * @param fieldNum - The field number to extract.
     * @returns The telemetry value or undefined if not found.
     */
    private extractTelemetryValue;
    /**
     * Frames a raw protobuf payload with the appropriate framing based on encryption state. This method automatically chooses between encrypted and plaintext framing.
     *
     * @param type - The message type.
     * @param payload - The message payload.
     */
    private frameAndSend;
    /**
     * Send a plaintext message with standard framing. Plaintext messages use a simple length-prefixed format.
     *
     * @param type - The message type.
     * @param payload - The message payload.
     */
    private sendPlaintextMessage;
    /**
     * Encode protobuf fields into a buffer. This creates a protobuf message from field definitions.
     *
     * @param fields - The fields to encode.
     * @returns The encoded protobuf message.
     */
    private encodeProtoFields;
    /**
     * Build key field as fixed32 for command requests. Entity keys are always sent as fixed32 fields in command messages.
     *
     * @param key - The entity key.
     * @returns The field definition.
     */
    private buildKeyField;
    /**
     * Add device_id field to command fields if the entity has one.
     *
     * @param fields - The array of protobuf fields to add to.
     * @param key - The entity key to look up device_id for.
     * @param fieldNumber - The field number to use for device_id.
     */
    private addDeviceIdField;
    /**
     * Get entity key by ID. This looks up the numeric key for an entity given its string ID.
     *
     * @param id - The entity ID to look up.
     *
     * @returns The entity key or `null` if not found.
     */
    getEntityKey(id: string): Nullable<number>;
    /**
     * Log all registered entity IDs for debugging. Logs entities grouped by type with their names and keys. This is primarily a debugging and development tool.
     */
    logAllEntityIds(): void;
    /**
     * Get entity information by ID. This retrieves full entity details given its string ID.
     *
     * @param id - The entity ID to look up.
     *
     * @returns The entity information or `null` if not found.
     */
    getEntityById(id: string): Nullable<Entity>;
    /**
     * Check if an entity ID exists. This is useful for validating entity IDs before sending commands.
     *
     * @param id - The entity ID to check.
     *
     * @returns `true` if the entity exists, `false` otherwise.
     */
    hasEntity(id: string): boolean;
    /**
     * Get all available entity IDs grouped by type. This provides a structured view of all discovered entities.
     *
     * @returns Object with entity types as keys and arrays of IDs as values.
     */
    getAvailableEntityIds(): Record<string, string[]>;
    /**
     * Get all entities with their IDs. This returns the complete list of entities with their string IDs included.
     *
     * @returns Array of entities with their corresponding IDs.
     */
    getEntitiesWithIds(): Array<Entity & {
        id: string;
    }>;
    /**
     * Send a ping request to the device to heartbeat the connection. This can be used to keep the connection alive and verify connectivity.
     */
    sendPing(): void;
    /**
     * Sends a SwitchCommandRequest for the given entity ID and on/off state. This controls binary switch entities like garage door openers.
     *
     * @param id - The entity ID (format: "switch-object_id").
     * @param state - `true` for on, `false` for off.
     */
    sendSwitchCommand(id: string, state: boolean): void;
    /**
     * Sends a ButtonCommandRequest to press a button entity. Button entities trigger one-time actions when pressed.
     *
     * @param id - The entity ID (format: "button-object_id").
     */
    sendButtonCommand(id: string): void;
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
    sendCoverCommand(id: string, options: Partial<{
        stop: boolean;
        position: number;
        tilt: number;
    }>): void;
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
    sendFanCommand(id: string, options: {
        state?: boolean;
        speedLevel?: number;
        oscillating?: boolean;
        direction?: "forward" | "reverse";
        presetMode?: string;
    }): void;
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
    sendLightCommand(id: string, options: {
        state?: boolean;
        brightness?: number;
        colorMode?: ColorMode;
        colorBrightness?: number;
        rgb?: {
            r: number;
            g: number;
            b: number;
        };
        white?: number;
        colorTemperature?: number;
        coldWhite?: number;
        warmWhite?: number;
        effect?: string;
        transitionLength?: number;
        flashLength?: number;
    }): void;
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
    sendLockCommand(id: string, command: "lock" | "unlock" | "open", code?: string): void;
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
    sendClimateCommand(id: string, options: {
        mode?: "off" | "heat_cool" | "cool" | "heat" | "fan_only" | "dry" | "auto";
        targetTemperature?: number;
        targetTemperatureLow?: number;
        targetTemperatureHigh?: number;
        fanMode?: "on" | "off" | "auto" | "low" | "medium" | "high" | "middle" | "focus" | "diffuse" | "quiet";
        swingMode?: "off" | "both" | "vertical" | "horizontal";
        customFanMode?: string;
        preset?: "none" | "home" | "away" | "boost" | "comfort" | "eco" | "sleep" | "activity";
        customPreset?: string;
        targetHumidity?: number;
    }): void;
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
    sendNumberCommand(id: string, value: number): void;
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
    sendSelectCommand(id: string, option: string): void;
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
    sendTextCommand(id: string, text: string): void;
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
    sendDateCommand(id: string, year: number, month: number, day: number): void;
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
    sendTimeCommand(id: string, hour: number, minute: number, second?: number): void;
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
    sendDateTimeCommand(id: string, epochSeconds: number): void;
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
    sendMediaPlayerCommand(id: string, options: {
        command?: MediaPlayerCommand;
        volume?: number;
        mediaUrl?: string;
        announcement?: boolean;
    }): void;
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
    sendAlarmControlPanelCommand(id: string, command: "disarm" | "arm_home" | "arm_away" | "arm_night" | "arm_vacation" | "arm_custom_bypass" | "trigger", code?: string): void;
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
    sendSirenCommand(id: string, options: {
        state?: boolean;
        tone?: string;
        duration?: number;
        volume?: number;
    }): void;
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
    sendUpdateCommand(id: string, command: "none" | "update" | "check"): void;
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
    sendCameraImageRequest(single: boolean): void;
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
    sendValveCommand(id: string, options: {
        position?: number;
        stop?: boolean;
    }): void;
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
    getServices(): ServiceEntity[];
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
    executeService(key: number, args?: ExecuteServiceArgumentValue[]): void;
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
    executeServiceByName(name: string, args?: ExecuteServiceArgumentValue[]): void;
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
    subscribeVoiceAssistant(flags?: VoiceAssistantSubscribeFlag): void;
    /**
     * Unsubscribe from voice assistant events.
     *
     * @example
     * ```typescript
     * client.unsubscribeVoiceAssistant();
     * ```
     */
    unsubscribeVoiceAssistant(): void;
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
    sendVoiceAssistantResponse(port: number, error: boolean): void;
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
    sendVoiceAssistantEvent(eventType: VoiceAssistantEvent, data?: VoiceAssistantEventData[]): void;
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
    sendVoiceAssistantAudio(audioData: Buffer, end?: boolean): void;
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
    sendVoiceAssistantTimerEvent(timerData: VoiceAssistantTimerEventData): void;
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
    requestVoiceAssistantConfiguration(): void;
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
    setVoiceAssistantConfiguration(activeWakeWords: string[]): void;
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
    sendVoiceAssistantAnnounce(options: {
        mediaId?: string;
        text?: string;
        preannounceMediaId?: string;
        startConversation?: boolean;
    }): void;
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
    getVoiceAssistantConfiguration(): VoiceAssistantConfiguration | null;
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
    isVoiceAssistantSubscribed(): boolean;
    /**
     * Encode a signed integer using zigzag encoding for efficient protobuf representation.
     *
     * @param value - The signed integer to encode.
     * @returns The zigzag encoded value.
     */
    private encodeZigzag;
    /**
     * Encode an integer as a VarInt (protobuf-style). VarInts use 7 bits per byte with a continuation bit in the MSB.
     *
     * @param value - The value to encode.
     * @returns The encoded varint as a Buffer.
     */
    private encodeVarint;
    /**
     * Read a VarInt from buffer at offset; returns [value, bytesRead]. This decodes protobuf-style variable-length integers.
     *
     * @param buffer - The buffer to read from.
     * @param offset - The offset to start reading at.
     * @returns A tuple of [decoded value, number of bytes consumed].
     */
    private readVarint;
    /**
     * Decode a simple protobuf message into a map of field numbers to values. This implements basic protobuf decoding for the ESPHome protocol.
     *
     * @param buffer - The protobuf message to decode.
     * @returns A map from field numbers to arrays of decoded values.
     */
    private decodeProtobuf;
    /**
     * Return whether we are on an encrypted connection or not.
     *
     * @returns `true` if we are on an encrypted connection, `false` otherwise.
     */
    get isEncrypted(): boolean;
}
export interface EspHomeClient {
    /**
     * Subscribes to an event and invokes the listener every time the event is emitted. The payload type is inferred from the event name based on {@link ClientEventsMap}.
     *
     * @param event - The name of the event to subscribe to.
     * @param listener - The function to invoke when the event is emitted.
     * @returns The client instance, to allow chaining.
     */
    on<K extends keyof ClientEventsMap>(event: K, listener: (payload: ClientEventsMap[K]) => void): this;
    /**
     * Subscribes to an event and invokes the listener at most once. After the first invocation, the listener is removed. The payload type is inferred from the event name
     * based on {@link ClientEventsMap}.
     *
     * @param event - The name of the event to subscribe to.
     * @param listener - The function to invoke once when the event is emitted.
     * @returns The client instance, to allow chaining.
     */
    once<K extends keyof ClientEventsMap>(event: K, listener: (payload: ClientEventsMap[K]) => void): this;
}
export {};
