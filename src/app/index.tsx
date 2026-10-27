import { router } from 'expo-router';
import { useMemo } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const theme = useTheme();
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx > 24 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx > 72) {
            router.push('/explore');
          }
        },
      }),
    [],
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView {...panResponder.panHandlers} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.heading}>
            <ThemedText type="smallBold" themeColor="accent">
              ORGANIZER
            </ThemedText>
            <ThemedText type="title" style={styles.title}>
              Alles an{'\n'}einem Ort.
            </ThemedText>
            <ThemedText themeColor="textSecondary" style={styles.subtitle}>
              Halte deine Gedanken und Notizen fest.
            </ThemedText>
          </View>

          <View style={styles.voiceSection}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Mikrofon. Sprachsteuerung folgt in einer späteren Phase."
              accessibilityState={{ disabled: true }}
              disabled
              style={[styles.microphoneButton, { backgroundColor: theme.accent }]}>
              <View style={styles.microphoneIcon}>
                <View style={styles.microphoneCapsule} />
                <View style={styles.microphoneCradle} />
                <View style={styles.microphoneStem} />
                <View style={styles.microphoneBase} />
              </View>
            </Pressable>
            <ThemedText type="small" themeColor="textSecondary" style={styles.voiceHint}>
              Sprachsteuerung kommt in einer späteren Phase.
            </ThemedText>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Meine Notizen öffnen"
            onPress={() => router.push('/explore')}
            style={({ pressed }) => [styles.notesButton, pressed && styles.pressed]}>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              Meine Notizen ansehen
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },
  safeArea: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.four,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.five,
    paddingBottom: Platform.OS === 'web' ? 96 : Spacing.five,
  },
  heading: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    textAlign: 'center',
    marginTop: Spacing.two,
  },
  subtitle: {
    textAlign: 'center',
  },
  voiceSection: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  microphoneButton: {
    width: 216,
    height: 216,
    borderRadius: 108,
    justifyContent: 'center',
    alignItems: 'center',
  },
  microphoneIcon: {
    alignItems: 'center',
  },
  microphoneCapsule: {
    width: 36,
    height: 64,
    borderWidth: 4,
    borderColor: '#ffffff',
    borderRadius: 20,
  },
  microphoneCradle: {
    width: 64,
    height: 36,
    marginTop: -25,
    borderColor: '#ffffff',
    borderWidth: 4,
    borderTopWidth: 0,
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
  },
  microphoneStem: {
    width: 4,
    height: 16,
    backgroundColor: '#ffffff',
  },
  microphoneBase: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#ffffff',
  },
  voiceHint: {
    textAlign: 'center',
  },
  notesButton: {
    minHeight: 56,
    alignSelf: 'stretch',
    borderRadius: 18,
    paddingHorizontal: Spacing.four,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#80808055',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
