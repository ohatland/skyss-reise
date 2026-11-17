import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { formatClock } from '@/core/time';
import { useTheme } from '@/hooks/use-theme';
import type { LogProperties } from '@/logging/logger';
import { MARK_CATEGORIES, sendMark, sendMarkNote, type MarkCategory } from '@/logging/mark';

/**
 * The flag at the bottom of the screen. One press saves the moment with what
 * the screen shows (`snapshot`), and then a sheet offers a category and a note,
 * both optional. See docs/design/merk-og-logg.md.
 */
export function MarkButton({ snapshot }: { snapshot: () => LogProperties }) {
  const theme = useTheme();
  const [mark, setMark] = useState<{ id: string; at: Date } | null>(null);
  const [category, setCategory] = useState<MarkCategory | null>(null);
  const [note, setNote] = useState('');

  const press = () => {
    const at = new Date();
    setMark({ id: sendMark(snapshot(), at), at });
    setCategory(null);
    setNote('');
  };

  /** "Ferdig", or leaving the sheet some other way: what was written is kept either way. */
  const close = () => {
    if (mark) sendMarkNote(mark.id, category, note);
    setMark(null);
  };

  return (
    <>
      <Pressable
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel="Merk"
        accessibilityHint="Lagrer øyeblikket og det skjermen viser"
        style={[styles.flag, { borderColor: theme.border }]}>
        <SymbolView
          name={{ ios: 'flag', android: 'flag', web: 'flag' }}
          size={18}
          tintColor={theme.textSecondary}
          fallback={<Text style={{ color: theme.textSecondary, fontSize: 16 }}>⚑</Text>}
        />
      </Pressable>

      <Modal visible={mark !== null} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <Pressable style={styles.fill} onPress={close} accessibilityLabel="Lukk" />
          <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color: theme.text }]} accessibilityRole="header">
                Merket
              </Text>
              <Text style={[styles.body, { color: theme.textSecondary }]}>{mark ? formatClock(mark.at) : ''}</Text>
            </View>
            <Text style={[styles.body, { color: theme.textSecondary }]}>Skjermbildet og tallene bak er lagret.</Text>

            <Text style={[styles.label, { color: theme.textMuted }]}>Hva gjelder det? Valgfritt</Text>
            <View style={styles.chips}>
              {MARK_CATEGORIES.map((name) => {
                const on = category === name;
                return (
                  <Pressable
                    key={name}
                    onPress={() => setCategory(on ? null : name)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[
                      styles.chip,
                      { borderColor: on ? theme.text : theme.border, backgroundColor: on ? theme.text : 'transparent' },
                    ]}>
                    <Text style={[styles.body, { color: on ? theme.background : theme.text }]}>{name}</Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              placeholder="Notat"
              placeholderTextColor={theme.textMuted}
              accessibilityLabel="Notat"
              style={[styles.field, { borderColor: theme.border, color: theme.text }]}
            />

            <Pressable
              onPress={close}
              accessibilityRole="button"
              style={[styles.done, { borderColor: theme.border }]}>
              <Text style={[styles.body, { color: theme.text }]}>Ferdig</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flag: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  fill: { flex: 1 },
  sheet: {
    borderTopWidth: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.one,
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  title: { fontSize: FontSize.heading, fontWeight: '500' },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16, marginTop: Spacing.three },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  chip: { borderWidth: 1, borderRadius: Radius.control, paddingVertical: 3, paddingHorizontal: 10 },
  field: {
    borderWidth: 1,
    borderRadius: Radius.control,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
    fontSize: FontSize.body,
    textAlignVertical: 'top',
  },
  done: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
