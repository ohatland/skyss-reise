import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { FontSize, Radius, Spacing } from '@/constants/theme';
import { searchStops, type StopHit } from '@/entur/stops';
import { useTheme } from '@/hooks/use-theme';

interface Props {
  placeholder: string;
  onSelect: (stop: StopHit) => void;
  autoFocus?: boolean;
}

/** A text field that looks up stops in Entur's register as the traveller types. */
export function StopSearch({ placeholder, onSelect, autoFocus }: Props) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [hits, setHits] = useState<StopHit[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (text.trim().length < 2) {
      setHits([]);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchStops(text, { signal: controller.signal })
        .then((found) => {
          setHits(found);
          setFailed(false);
        })
        .catch(() => {
          if (!controller.signal.aborted) setFailed(true);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text]);

  return (
    <View>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        autoFocus={autoFocus}
        autoCorrect={false}
        accessibilityLabel={placeholder}
        style={[styles.input, { color: theme.text, borderColor: theme.border }]}
      />
      {failed && (
        <Text style={[styles.note, { color: theme.marginMissed }]}>Fikk ikke søkt hos Entur. Prøv igjen.</Text>
      )}
      {!failed && text.trim().length >= 2 && hits.length === 0 && (
        <Text style={[styles.note, { color: theme.textMuted }]}>Ingen holdeplasser funnet</Text>
      )}
      {hits.map((hit) => (
        <Pressable
          key={hit.id}
          onPress={() => {
            onSelect(hit);
            setText('');
            setHits([]);
          }}
          accessibilityRole="button"
          style={[styles.hit, { borderBottomColor: theme.borderSoft }]}>
          <Text style={{ color: theme.text, fontSize: FontSize.body }}>{hit.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    fontSize: FontSize.body,
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
  },
  note: { fontSize: FontSize.label, marginTop: Spacing.one },
  hit: { paddingVertical: Spacing.two, borderBottomWidth: 1 },
});
