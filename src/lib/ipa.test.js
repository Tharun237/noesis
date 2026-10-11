// M7: eSpeak-ng IPA samples from docs/research/languages.md (after removing `_`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ipaChars } from './ipa.js'

test('Hindi quirk b_ˈʌ_r_._h_i becomes bˈʌrhi', () => {
  assert.equal(ipaChars('b_ˈʌ_r_._h_i'), 'bˈʌrhi')
})

test('Hindi greeting sample', () => {
  assert.equal(ipaChars('n_ə_m_ˈʌ_s_t_eː'), 'nəmˈʌsteː')
  assert.equal(ipaChars('j_ˌə_h ˈeː_k p_ə_ɾ_ˈiː_k_ʃ_ə_ɳ h_ɛː'), 'jˌəh ˈeːk pəɾˈiːkʃəɳ hɛː')
  assert.equal(ipaChars('ˌaː_p k_ˈɛː_s_eː h_ɛ̃'), 'ˌaːp kˈɛːseː hɛ̃')
})

test('Telugu samples', () => {
  assert.equal(ipaChars('n_ˈa_m_a_s_k_ˌaː_r_a_n'), 'nˈamaskˌaːran')
  assert.equal(ipaChars('ˈi_d_i ˌo_k_a p_ˈa_r_iː_k_ʂ_a'), 'ˈidi ˌoka pˈariːkʂa')
  assert.equal(ipaChars('m_ˈiː_r_u ʲ_ˈe_l_aː ˈu_n_n_aː_r_u'), 'mˈiːru ʲˈelaː ˈunnaːru')
})

test('newlines become single spaces, output is trimmed and collapsed', () => {
  assert.equal(ipaChars('n_ə_m_ˈʌ_s_t_eː\nj_ˌə_h'), 'nəmˈʌsteː jˌəh')
  assert.equal(ipaChars('  a__b  .  c  \n\n d  '), 'ab c d')
  assert.equal(ipaChars(''), '')
})
