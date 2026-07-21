# Ujo native mobile services

These services add BLE hub claiming, network context, foreground location/geofence delivery, and local notifications to the Capacitor shell. They are kept as a separate package so the web/Vercel build remains small and does not bundle native-only plugins.

Copy or workspace-link `mobile-native/src` into the Capacitor application, install this package's dependencies, then run `npx cap sync`. Background geofencing requires platform-specific background execution and store permission review; the supplied service deliberately uses foreground updates until those native policies are configured.
