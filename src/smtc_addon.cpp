// Native Windows SMTC addon for Qobuz Desktop.
// Calls WinRT SystemMediaTransportControls directly instead of the Chromium audio hack.

#include <napi.h>

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <roapi.h>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Media.h>
#include <winrt/Windows.Storage.h>
#include <winrt/Windows.Storage.Streams.h>

#include <systemmediatransportcontrolsinterop.h>

#include <string>
#include <chrono>
#include <mutex>

using namespace winrt;
using namespace winrt::Windows::Foundation;
using namespace winrt::Windows::Media;
using namespace winrt::Windows::Storage;
using namespace winrt::Windows::Storage::Streams;

static SystemMediaTransportControls g_smtc{nullptr};
static Napi::ThreadSafeFunction g_tsfn;
static winrt::event_token g_buttonToken;
static winrt::event_token g_seekToken;
static std::mutex g_mutex; // protects g_tsfn (WinRT callbacks fire from background threads)
static bool g_initialized = false;

static TimeSpan SecondsToTimeSpan(double sec) {
    auto ms = static_cast<int64_t>(sec * 1000.0);
    return std::chrono::duration_cast<TimeSpan>(std::chrono::milliseconds(ms));
}

struct EventData {
    std::string name;
    double value;
};

static void EmitEvent(const char* name, double value = 0.0) {
    std::lock_guard<std::mutex> lock(g_mutex);
    if (!g_tsfn) return;

    auto data = new EventData{name, value};
    g_tsfn.NonBlockingCall(data, [](Napi::Env env, Napi::Function fn, EventData* d) {
        fn.Call({
            Napi::String::New(env, d->name),
            Napi::Number::New(env, d->value)
        });
        delete d;
    });
}

static Napi::Value Init(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_initialized) {
        Napi::Error::New(env, "SMTC already initialized").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    if (info.Length() < 2 || !info[0].IsBuffer() || !info[1].IsFunction()) {
        Napi::TypeError::New(env, "Expected (Buffer hwnd, Function callback)")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    auto buf = info[0].As<Napi::Buffer<uint8_t>>();
    if (buf.Length() < sizeof(HWND)) {
        Napi::Error::New(env, "HWND buffer too small").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    HWND hwnd = *reinterpret_cast<HWND*>(buf.Data());

    if (!IsWindow(hwnd)) {
        Napi::Error::New(env, "Invalid window handle").ThrowAsJavaScriptException();
        return env.Undefined();
    }

    g_tsfn = Napi::ThreadSafeFunction::New(
        env, info[1].As<Napi::Function>(), "smtc_events", 0, 1
    );

    try {
        // Electron may have already initialized COM — ignore RPC_E_CHANGED_MODE
        try { winrt::init_apartment(winrt::apartment_type::single_threaded); }
        catch (const winrt::hresult_error& e) {
            if (e.code() != HRESULT(0x80010106) && e.code() != HRESULT(1))
                throw;
        }

        auto interop = winrt::get_activation_factory<
            SystemMediaTransportControls,
            ISystemMediaTransportControlsInterop>();

        winrt::check_hresult(interop->GetForWindow(
            hwnd,
            winrt::guid_of<SystemMediaTransportControls>(),
            winrt::put_abi(g_smtc)
        ));

        g_smtc.IsEnabled(true);
        g_smtc.IsPlayEnabled(true);
        g_smtc.IsPauseEnabled(true);
        g_smtc.IsNextEnabled(true);
        g_smtc.IsPreviousEnabled(true);
        g_smtc.IsStopEnabled(true);
        g_smtc.PlaybackStatus(MediaPlaybackStatus::Closed);

        g_buttonToken = g_smtc.ButtonPressed(
            [](const SystemMediaTransportControls&,
               const SystemMediaTransportControlsButtonPressedEventArgs& args) {
                switch (args.Button()) {
                    case SystemMediaTransportControlsButton::Play:     EmitEvent("play"); break;
                    case SystemMediaTransportControlsButton::Pause:    EmitEvent("pause"); break;
                    case SystemMediaTransportControlsButton::Next:     EmitEvent("next"); break;
                    case SystemMediaTransportControlsButton::Previous: EmitEvent("prev"); break;
                    case SystemMediaTransportControlsButton::Stop:     EmitEvent("stop"); break;
                    default: break;
                }
            }
        );

        g_seekToken = g_smtc.PlaybackPositionChangeRequested(
            [](const SystemMediaTransportControls&,
               const PlaybackPositionChangeRequestedEventArgs& args) {
                auto pos = args.RequestedPlaybackPosition();
                double seconds = static_cast<double>(
                    std::chrono::duration_cast<std::chrono::milliseconds>(pos).count()
                ) / 1000.0;
                EmitEvent("seek", seconds);
            }
        );

        g_initialized = true;

    } catch (const winrt::hresult_error& e) {
        g_tsfn.Release();
        g_tsfn = nullptr;
        std::string msg = "SMTC init failed: " + winrt::to_string(e.message());
        Napi::Error::New(env, msg).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return Napi::Boolean::New(env, true);
}

static Napi::Value SetMetadata(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_initialized || !g_smtc) return env.Undefined();

    std::string title  = info.Length() > 0 && info[0].IsString() ? info[0].As<Napi::String>().Utf8Value() : "";
    std::string artist = info.Length() > 1 && info[1].IsString() ? info[1].As<Napi::String>().Utf8Value() : "";
    std::string album  = info.Length() > 2 && info[2].IsString() ? info[2].As<Napi::String>().Utf8Value() : "";
    std::string artwork = info.Length() > 3 && info[3].IsString() ? info[3].As<Napi::String>().Utf8Value() : "";

    try {
        auto updater = g_smtc.DisplayUpdater();
        updater.Type(MediaPlaybackType::Music);

        auto props = updater.MusicProperties();
        props.Title(winrt::to_hstring(title));
        props.Artist(winrt::to_hstring(artist));
        props.AlbumTitle(winrt::to_hstring(album));

        if (!artwork.empty()) {
            try {
                if (artwork.rfind("http", 0) == 0) {
                    Uri uri(winrt::to_hstring(artwork));
                    updater.Thumbnail(RandomAccessStreamReference::CreateFromUri(uri));
                } else {
                    // Local file — use proper UTF-8 conversion and normalize slashes
                    std::wstring wpath{winrt::to_hstring(artwork)};
                    for (auto& ch : wpath) { if (ch == L'/') ch = L'\\'; }
                    auto file = StorageFile::GetFileFromPathAsync(wpath).get();
                    updater.Thumbnail(RandomAccessStreamReference::CreateFromFile(file));
                }
            } catch (...) {}
        }

        updater.Update();
    } catch (...) {}

    return env.Undefined();
}

static Napi::Value SetState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_initialized || !g_smtc) return env.Undefined();

    std::string state = info.Length() > 0 && info[0].IsString()
        ? info[0].As<Napi::String>().Utf8Value() : "paused";

    try {
        if (state == "playing")       g_smtc.PlaybackStatus(MediaPlaybackStatus::Playing);
        else if (state == "paused")   g_smtc.PlaybackStatus(MediaPlaybackStatus::Paused);
        else if (state == "stopped")  g_smtc.PlaybackStatus(MediaPlaybackStatus::Stopped);
        else                          g_smtc.PlaybackStatus(MediaPlaybackStatus::Closed);
    } catch (...) {}

    return env.Undefined();
}

static Napi::Value SetPosition(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_initialized || !g_smtc) return env.Undefined();

    double posSec = info.Length() > 0 && info[0].IsNumber() ? info[0].As<Napi::Number>().DoubleValue() : 0.0;
    double durSec = info.Length() > 1 && info[1].IsNumber() ? info[1].As<Napi::Number>().DoubleValue() : 0.0;

    if (durSec <= 0) return env.Undefined();
    if (posSec < 0) posSec = 0;
    if (posSec > durSec) posSec = durSec;

    try {
        SystemMediaTransportControlsTimelineProperties timeline;
        timeline.StartTime(SecondsToTimeSpan(0));
        timeline.EndTime(SecondsToTimeSpan(durSec));
        timeline.Position(SecondsToTimeSpan(posSec));
        timeline.MinSeekTime(SecondsToTimeSpan(0));
        timeline.MaxSeekTime(SecondsToTimeSpan(durSec));
        g_smtc.UpdateTimelineProperties(timeline);
    } catch (...) {}

    return env.Undefined();
}

static Napi::Value Reset(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (!g_initialized || !g_smtc) return env.Undefined();

    bool full = info.Length() > 0 && info[0].IsBoolean() && info[0].As<Napi::Boolean>().Value();

    try {
        if (full) {
            g_smtc.PlaybackStatus(MediaPlaybackStatus::Closed);
            auto updater = g_smtc.DisplayUpdater();
            updater.ClearAll();
            updater.Update();
        } else {
            g_smtc.PlaybackStatus(MediaPlaybackStatus::Paused);
        }
    } catch (...) {}

    return env.Undefined();
}

static Napi::Value Destroy(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (g_smtc) {
        try {
            g_smtc.ButtonPressed(g_buttonToken);
            g_smtc.PlaybackPositionChangeRequested(g_seekToken);
            g_smtc.IsEnabled(false);
        } catch (...) {}
        g_smtc = nullptr;
    }

    {
        std::lock_guard<std::mutex> lock(g_mutex);
        if (g_tsfn) {
            g_tsfn.Release();
            g_tsfn = nullptr;
        }
    }

    g_initialized = false;
    return env.Undefined();
}

static Napi::Object InitModule(Napi::Env env, Napi::Object exports) {
    exports.Set("init",        Napi::Function::New(env, Init));
    exports.Set("setMetadata", Napi::Function::New(env, SetMetadata));
    exports.Set("setState",    Napi::Function::New(env, SetState));
    exports.Set("setPosition", Napi::Function::New(env, SetPosition));
    exports.Set("reset",       Napi::Function::New(env, Reset));
    exports.Set("destroy",     Napi::Function::New(env, Destroy));
    return exports;
}

NODE_API_MODULE(smtc_native, InitModule)
