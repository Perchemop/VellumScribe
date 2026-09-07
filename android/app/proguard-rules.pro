# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.

# Preserve line numbers for stack traces
-keepattributes SourceFile,LineNumberTable

# Preserve all JavascriptInterface annotations and methods for WebView bridge
-keepattributes JavascriptInterface
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Capacitor core bridge classes and plugin interfaces
-keep public class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public <methods>;
}
-keep public class com.getcapacitor.PluginMethod { *; }
-keep public class com.getcapacitor.Bridge { *; }
-keep public class com.getcapacitor.BridgeActivity { *; }
-keep public class com.getcapacitor.JSObject { *; }
-keep public class com.getcapacitor.JSArray { *; }

# Preserve custom JavaScript interface and WebView clients
-keepclassmembers class * {
    public void *(android.webkit.WebView, java.lang.String);
}

# Keep annotations
-keepattributes *Annotation*

# Prevent shrinking of native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# Preserve Serializable and Parcelable objects
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    !static !transient <fields>;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}
-keep class * implements android.os.Parcelable {
    public static final android.os.Parcelable$Creator *;
}
