// -----------------------------------------------------------
//  [*] Tabs — Student ID
//
//  The virtual student card: burgundy VU/KNF band, photo,
//  role badge, the three editable study fields and a QR code
//  on one surface sheet. The header pencil flips the fields
//  into an edit form; saves go through PUT /social/profile
//  and the SERVER-returned user is merged into the session —
//  the response omits `invited`, and hand-patching fields
//  from the stale closure used to clobber concurrent updates.
//
//  The QR payload is UNSIGNED display-only JSON built right
//  here on the client — anyone can forge an identical code,
//  so it identifies but never authenticates; a verifiable
//  credential would need a backend-signed token. The email is
//  deliberately left out of the payload so it cannot be
//  harvested from a photo of the card.
//
//  Avatar uploads persist the RELATIVE upload.url — Avatar
//  resolves it with getUploadUrl at render time, so stored
//  profiles survive host changes. The old screen also wrote a
//  card cache to AsyncStorage that nothing ever read; that
//  write is deleted rather than promoted to a feature — the
//  auth session already persists locally, so a signed-in
//  user's card renders offline from state anyway.
//
//  Logged out, LoginRequiredOverlay swaps the body for the
//  login invitation — auth adds this card, it gates nothing.
//
//  Split into (root component last):
//
//    CARD_SHADOW     — the card sheet elevation
//    CardHeader      — the burgundy VU / KNF band
//    IdPhoto         — avatar pressable with the camera badge
//    InfoRow         — one label/value line of the card
//    EditForm        — study-field inputs + save/cancel row
//    IdCard          — the signed-in card screen
//    StudentIdScreen — auth-gate wrapper (default export)
// -----------------------------------------------------------

// Auth gate, session state and toasts
import LoginRequiredOverlay from '@/components/LoginRequiredOverlay';
import { useAuth } from '@/context/AuthContext';
import { showToast } from '@/context/NetworkContext';

// UI kit and theming
import { Avatar, Button, Header, Input, RefreshSpinner, Screen } from '@/components/ui';
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';

// Profile calls — field edits, avatar upload, session refresh
import { ApiError, fetchMe, updateProfile, uploadImageApi } from '@/services/api';

// Server failures render as translated copy, never raw text
import { apiErrorKey } from '@/services/api/errors';

// Shared role → label map, identical across every screen
import { roleLabel } from '@/constants/roles';

// Session user shape
import { User } from '@/types';

// Card primitives — picker, QR renderer, RN plumbing
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';


// Soft elevation for the card sheet — black shadow reads on
// both schemes ('#000' is the one permitted raw hex)
const CARD_SHADOW: ViewStyle = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 6,
};

// PUT /social/profile study-field payload — blank inputs go
// out as null so the backend clears the field
interface StudentFields {
  student_number: string | null;
  study_group: string | null;
  study_program: string | null;
}

interface InfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
}

interface IdPhotoProps {
  user: User;
  uploading: boolean;
  onPress: () => void;
}

interface EditFormProps {
  user: User;
  saving: boolean;
  onSave: (fields: StudentFields) => void;
  onCancel: () => void;
}







// -----------------------------------------------------------
// CardHeader
// -----------------------------------------------------------
//
// The burgundy band on top of the card — university over
// faculty, the card's only brand-colored region (the design
// is deliberately gradient-free).
//
// Used by:
//   - IdCard (below)
// -----------------------------------------------------------

function CardHeader() {
  const { t } = useTranslation();


  return (
    <View className="bg-brand px-md py-md">
      <Text className="font-raleway-medium text-xs uppercase tracking-widest text-on-brand">
        {t('id.university')}
      </Text>
      <Text className="font-raleway-bold text-lg text-on-brand">
        {t('id.faculty')}
      </Text>
    </View>
  );
}







// -----------------------------------------------------------
// IdPhoto
// -----------------------------------------------------------
//
// The card portrait as a 64pt press target: Avatar (photo or
// initial fallback) with a camera badge that turns into a
// spinner while the upload runs. Presses are ignored during
// the upload so one photo can't be submitted twice.
//
// Used by:
//   - IdCard (below)
// -----------------------------------------------------------

function IdPhoto({ user, uploading, onPress }: IdPhotoProps) {

  const { t } = useTranslation();
  const { colors } = useTheme();


  return (
    <Pressable
      onPress={onPress}
      disabled={uploading}
      accessibilityRole="button"
      accessibilityLabel={t('id.changePhoto')}
      accessibilityState={{ disabled: uploading, busy: uploading }}
    >
      <Avatar uri={user.avatarUrl} name={user.displayName} size={64} />

      {/* Camera badge — spinner while the upload runs */}
      <View className="absolute bottom-0 right-0 h-6 w-6 items-center justify-center rounded-full border border-line bg-surface">
        {uploading ? (
          <ActivityIndicator size="small" color={colors.brand} />
        ) : (
          <Ionicons name="camera" size={13} color={colors.brand} />
        )}
      </View>
    </Pressable>
  );
}







// -----------------------------------------------------------
// InfoRow
// -----------------------------------------------------------
//
// One label/value line of the card. `mono` puts the value in
// SpaceMono (the student number reads as a code), `muted`
// fades placeholder values ("not set") to ink-faint.
//
// Used by:
//   - IdCard (below) — the three study-field rows
// -----------------------------------------------------------

function InfoRow({ label, value, mono = false, muted = false }: InfoRowProps) {

  const valueClasses = [
    'ml-md flex-1 text-right',
    mono ? 'font-mono' : 'font-raleway',
    'text-base',
    muted ? 'text-ink-faint' : 'text-ink',
  ].join(' ');


  return (
    <View className="flex-row items-center justify-between border-t border-line py-3">
      <Text className="font-raleway-bold text-xs uppercase tracking-widest text-ink-soft">
        {label}
      </Text>
      <Text className={valueClasses}>{value}</Text>
    </View>
  );
}







// -----------------------------------------------------------
// EditForm
// -----------------------------------------------------------
//
// The three study-field inputs with return-key chaining
// (number → group → program → save) and the cancel/save row.
// Drafts seed from the user once on mount — the form mounts
// fresh every time editing starts, so no sync effect exists.
// Trimmed-empty fields submit as null to clear server-side.
//
// Used by:
//   - IdCard (below) — swapped in for the info rows
// -----------------------------------------------------------

function EditForm({ user, saving, onSave, onCancel }: EditFormProps) {

  const { t } = useTranslation();
  const [number, setNumber] = useState(user.studentNumber ?? '');
  const [group, setGroup] = useState(user.studyGroup ?? '');
  const [program, setProgram] = useState(user.studyProgram ?? '');


  // Return-key chaining targets
  const groupRef = useRef<TextInput>(null);
  const programRef = useRef<TextInput>(null);


  const submit = () => {
    onSave({
      student_number: number.trim() || null,
      study_group: group.trim() || null,
      study_program: program.trim() || null,
    });
  };


  return (
    <View className="px-md pt-sm">

      <Input
        label={t('id.studentNumber')}
        value={number}
        onChangeText={setNumber}
        placeholder={t('id.numberPlaceholder')}
        maxLength={50}
        autoCapitalize="characters"
        onSubmitEditing={() => groupRef.current?.focus()}
      />

      <Input
        ref={groupRef}
        label={t('id.studyGroup')}
        value={group}
        onChangeText={setGroup}
        placeholder={t('id.groupPlaceholder')}
        maxLength={50}
        onSubmitEditing={() => programRef.current?.focus()}
      />

      <Input
        ref={programRef}
        label={t('id.studyProgram')}
        value={program}
        onChangeText={setProgram}
        placeholder={t('id.programPlaceholder')}
        maxLength={50}
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      {/* Cancel is locked during the save so the form can't
          unmount under an in-flight request */}
      <View className="mb-sm flex-row gap-md">
        <View className="flex-1">
          <Button
            title={t('id.cancel')}
            variant="secondary"
            onPress={onCancel}
            disabled={saving}
          />
        </View>
        <View className="flex-1">
          <Button title={t('id.save')} onPress={submit} loading={saving} />
        </View>
      </View>
    </View>
  );
}







// -----------------------------------------------------------
// IdCard
// -----------------------------------------------------------
//
// The signed-in screen: static Header with the edit pencil,
// then the card sheet in a pull-to-refresh ScrollView.
// Refresh pulls /auth/me so field or avatar edits made on
// another device land here. Both mutations apply the server-
// returned user (merged over the current one — see the file
// header) and toast success/failure; the upload persists the
// RELATIVE path only.
//
// Used by:
//   - StudentIdScreen (below) — when authenticated
// -----------------------------------------------------------

function IdCard() {

  const { user, setUser } = useAuth();
  const { t } = useTranslation();
  const { colors } = useTheme();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // The username/email block under the QR is collapsed by
  // default — the card is held up for OTHERS to scan, so the
  // address must not sit in the same camera frame unasked
  const [identityShown, setIdentityShown] = useState(false);


  // Async mutations must merge over the LATEST user, never the
  // render closure that started them — a pull-to-refresh
  // landing while a save is in flight would otherwise be
  // re-covered by pre-refresh fields
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);


  // LoginRequiredOverlay only renders this while authenticated,
  // and the auth reducer never authenticates without a user —
  // this guard exists for the type system, not for a real state
  if (!user) return null;


  const saveFields = async (fields: StudentFields) => {
    setSaving(true);
    try {
      const updated = await updateProfile(fields);
      setUser({ ...(userRef.current ?? user), ...updated });
      setEditing(false);
      showToast('success', t('id.saved'));
    } catch {
      showToast('error', t('id.saveError'));
    } finally {
      setSaving(false);
    }
  };


  const changePhoto = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const upload = await uploadImageApi(
        asset.uri,
        asset.fileName ?? undefined,
        asset.mimeType ?? undefined,
        asset.fileSize ?? undefined,
      );
      // Persist the RELATIVE path — Avatar resolves it with
      // getUploadUrl at render time
      const updated = await updateProfile({ avatar_url: upload.url });
      setUser({ ...(userRef.current ?? user), ...updated });
      showToast('success', t('id.photoUpdated'));
    } catch (err) {
      // API failures explain themselves (too large, timeout,
      // offline…); only non-API errors keep the generic copy
      showToast('error', err instanceof ApiError ? t(apiErrorKey(err)) : t('id.photoError'));
    } finally {
      setUploading(false);
    }
  };


  const refresh = async () => {
    setRefreshing(true);
    try {
      setUser(await fetchMe());
    } catch {
      showToast('error', t('id.refreshError'));
    } finally {
      setRefreshing(false);
    }
  };


  // Unsigned, display-only payload (see the file header) —
  // email stays off it so a photo of the card leaks no address
  const qrPayload = JSON.stringify({
    id: user.id,
    name: user.displayName,
    role: user.role,
    faculty: 'VU KNF',
    studentNumber: user.studentNumber || undefined,
    studyGroup: user.studyGroup || undefined,
  });


  return (
    <Screen>
      <Header
        title={t('id.title')}
        right={
          !editing ? (
            <Pressable
              onPress={() => setEditing(true)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('id.editCard')}
            >
              <Ionicons name="create-outline" size={22} color={colors.onBrand} />
            </Pressable>
          ) : undefined
        }
      />

      {/* No stack header above this tab, so no vertical offset;
          Android needs an explicit 'height' — undefined is a
          no-op there */}
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="items-center p-md pb-2xl"
          refreshControl={
            <RefreshSpinner
              refreshing={refreshing}
              onRefresh={refresh}
            />
          }
        >

          {/* The card — one surface sheet, brand band on top */}
          <View
            className="w-full max-w-sm overflow-hidden rounded-xl bg-surface"
            style={CARD_SHADOW}
          >

            <CardHeader />

            {/* Photo, name and role */}
            <View className="flex-row items-center px-md pb-sm pt-md">
              <IdPhoto user={user} uploading={uploading} onPress={changePhoto} />
              <View className="ml-md flex-1">
                <Text className="font-raleway-bold text-lg text-ink" numberOfLines={1}>
                  {user.displayName}
                </Text>
                <View className="mt-xs flex-row">
                  <View className="rounded-md bg-brand-soft px-sm py-xs">
                    <Text className="font-raleway-bold text-sm text-brand">
                      {roleLabel(t, user.role)}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Study fields — rows, or the edit form in place */}
            {editing ? (
              <EditForm
                user={user}
                saving={saving}
                onSave={saveFields}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <View className="px-md pb-sm">
                <InfoRow
                  label={t('id.studentNumber')}
                  value={user.studentNumber || t('id.noNumber')}
                  mono={!!user.studentNumber}
                  muted={!user.studentNumber}
                />
                <InfoRow
                  label={t('id.studyGroup')}
                  value={user.studyGroup || t('id.noGroup')}
                  muted={!user.studyGroup}
                />
                <InfoRow
                  label={t('id.studyProgram')}
                  value={user.studyProgram || t('id.noProgram')}
                  muted={!user.studyProgram}
                />
              </View>
            )}

            {/* QR — the tile stays white in BOTH schemes on
                purpose: inverted QR codes fail on many readers,
                and on-brand is the palette's constant white.
                The SVG is invisible to screen readers, so the
                tile itself reads as the holder's card image. */}
            <View className="mx-md items-center border-t border-line py-lg">
              <View
                className="rounded-lg border border-line bg-on-brand p-md"
                accessible
                accessibilityRole="image"
                accessibilityLabel={t('id.qrLabel', { name: user.displayName })}
              >
                <QRCode value={qrPayload} size={180} />
              </View>
            </View>

            {/* Account identity — kept OFF the QR payload AND
                collapsed by default: the card is presented to
                other people, so the email must not sit in the
                same camera frame as the QR unless the owner
                reveals it on purpose */}
            <View className="border-t border-line px-md pb-md pt-sm">
              <Pressable
                className="flex-row items-center justify-between py-1"
                onPress={() => setIdentityShown((shown) => !shown)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={identityShown ? t('id.hideAccount') : t('id.showAccount')}
                accessibilityState={{ expanded: identityShown }}
              >
                <Text className="font-raleway-medium text-xs text-ink-soft">
                  {identityShown ? t('id.hideAccount') : t('id.showAccount')}
                </Text>
                <Ionicons
                  name={identityShown ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.inkFaint}
                />
              </Pressable>
              {identityShown ? (
                <>
                  <Text className="mt-xs font-raleway text-xs text-ink-soft">@{user.username}</Text>
                  <Text className="mt-xs font-raleway text-xs text-ink-soft">{user.email}</Text>
                </>
              ) : null}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}







// -----------------------------------------------------------
// StudentIdScreen (default export)
// -----------------------------------------------------------
//
// Used by:
//   - app/(main)/tabs/_layout.tsx — the "id" tab route
// -----------------------------------------------------------

export default function StudentIdScreen() {
  const { t } = useTranslation();


  return (
    <LoginRequiredOverlay
      headerTitle={t('id.title')}
      icon="id-card-outline"
      message={t('id.loginRequired')}
      hint={t('id.loginHint')}
    >
      <IdCard />
    </LoginRequiredOverlay>
  );
}
