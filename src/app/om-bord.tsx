import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TripCard } from '@/components/trip-card';
import { FontSize, Radius, Spacing } from '@/constants/theme';
import { noCardsText, onBoardCards, onBoardHeading, questionText, strandedAtStop } from '@/core/on-board';
import { formatClock } from '@/core/time';
import { useOnBoard } from '@/hooks/use-on-board';
import { useTheme } from '@/hooks/use-theme';

/** Back to the front page, under this screen when on board was started from it. */
function toFrontPage() {
  if (router.canDismiss()) router.dismissTo('/');
  else router.replace('/');
}

/**
 * On board: where the traveller is, the question the app has, and one card per
 * trip on with the plan on top. See docs/design/om-bord.md.
 */
export default function OnBoardScreen() {
  const theme = useTheme();
  const { state, answer, gotOff, canGetOff, refresh, finish, end } = useOnBoard();
  const [showHidden, setShowHidden] = useState(false);
  const left = useRef(false);

  // Back to the front page when the trip is over, and when there is none, as after a reload.
  useEffect(() => {
    if (left.current || (state && !state.over)) return;
    left.current = true;
    toFrontPage();
    end();
  }, [state, end]);

  if (!state) return <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]} />;

  const { plan, question, failed, boarded } = state;
  const vehicle = plan?.vehicle ?? null;
  const heading = onBoardHeading(vehicle ?? boarded);
  const cards = plan ? onBoardCards(plan, showHidden) : [];
  const hidden = plan?.hidden ?? [];
  const nothing = plan ? noCardsText(plan) : null;
  const waiting = Boolean(state.session.following.gotOffAt);
  const muted = [styles.body, { color: theme.textSecondary }];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]} accessibilityRole="header">
          {heading}
        </Text>

        {failed && (
          <Pressable onPress={refresh} accessibilityRole="button" style={styles.notice}>
            <Text style={[styles.label, { color: theme.textMuted }]}>
              {plan ? `Fikk ikke oppdatert fra Entur. Tallene er fra ${formatClock(plan.at)}.` : 'Fikk ikke kontakt med Entur. Prøv igjen.'}
            </Text>
          </Pressable>
        )}

        {question && (
          <View
            style={[styles.ask, { backgroundColor: theme.askBackground, borderColor: theme.askBorder }]}
            accessibilityLiveRegion="polite">
            <Text style={[styles.askText, { color: theme.askText }]}>{questionText(question)}</Text>
            <View style={styles.askButtons}>
              {(['Ja', 'Nei'] as const).map((reply) => (
                <Pressable
                  key={reply}
                  onPress={() => answer(reply === 'Ja')}
                  accessibilityRole="button"
                  style={[styles.askButton, { borderColor: theme.askBorder }]}>
                  <Text style={[styles.body, { color: theme.askText }]}>{reply}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {!plan && !failed && <Text style={[muted, styles.empty]}>Henter reiser…</Text>}
        {nothing && <Text style={[muted, styles.empty]}>{nothing}</Text>}
        {plan && strandedAtStop(plan) && (
          <Pressable
            onPress={finish}
            accessibilityRole="button"
            style={[styles.button, styles.wide, styles.more, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>Avslutt reisen</Text>
          </Pressable>
        )}

        {cards.slice(0, plan?.trips.length).map((card) => (
          <TripCard
            key={card.trip.cardKey}
            trip={card.trip}
            best={card.best}
            showLabels={card.showLabel}
            showColumnHeadings={card.showColumnHeadings}
            onBoard
          />
        ))}

        {/* The button stays where it is, so it marks where the hidden cards begin. */}
        {hidden.length > 0 && (
          <Pressable
            onPress={() => setShowHidden((value) => !value)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showHidden }}
            style={[styles.button, styles.wide, styles.more, { borderColor: theme.border }]}>
            <Text style={[styles.body, { color: theme.text }]}>
              {showHidden ? 'Vis færre' : `Vis flere (${hidden.length})`}
            </Text>
          </Pressable>
        )}

        {cards.slice(plan?.trips.length).map((card) => (
          <TripCard
            key={card.trip.cardKey}
            trip={card.trip}
            best={card.best}
            showLabels={card.showLabel}
            showColumnHeadings={card.showColumnHeadings}
            onBoard
          />
        ))}
      </ScrollView>

      {!waiting && (
        <View style={styles.bar}>
          <Pressable
            onPress={gotOff}
            disabled={!canGetOff}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canGetOff }}
            style={[styles.button, styles.wide, styles.grow, { borderColor: theme.border }, !canGetOff && styles.dimmed]}>
            <Text style={[styles.body, { color: theme.textSecondary }]}>Jeg har gått av</Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Spacing.four, paddingTop: Spacing.four, paddingBottom: Spacing.five },
  heading: { fontSize: FontSize.heading, fontWeight: '500', lineHeight: 22, paddingHorizontal: Spacing.half, paddingBottom: Spacing.one },
  body: { fontSize: FontSize.body, lineHeight: 19 },
  label: { fontSize: FontSize.label, lineHeight: 16 },
  notice: { marginTop: Spacing.two },
  empty: { marginTop: Spacing.four },
  ask: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    marginTop: Spacing.two,
    paddingVertical: 10,
    paddingHorizontal: Spacing.three,
    borderWidth: 1,
    borderRadius: Radius.card,
  },
  askText: { flex: 1, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  askButtons: { flexDirection: 'row', gap: 6 },
  askButton: { borderWidth: 1, borderRadius: Radius.control, paddingVertical: 6, paddingHorizontal: Spacing.three },
  button: {
    borderWidth: 1,
    borderRadius: Radius.control,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  wide: { alignItems: 'center' },
  grow: { flex: 1 },
  more: { marginTop: Spacing.three },
  bar: { flexDirection: 'row', paddingHorizontal: Spacing.four, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  dimmed: { opacity: 0.5 },
});
