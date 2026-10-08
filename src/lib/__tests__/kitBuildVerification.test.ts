import { describe, it, expect } from 'vitest'
import {
  detectKitCategory,
  getCinemaKitDependencies,
  evaluateKitCompleteness,
} from '../kitBuildVerification'

describe('Kit-Build Verification Engine (src/lib/kitBuildVerification.ts)', () => {
  describe('detectKitCategory', () => {
    it('detects cinema camera models correctly', () => {
      expect(detectKitCategory('RED Komodo-X 6K Cinema Package')).toBe('cinema_camera')
      expect(detectKitCategory('Sony FX3 Full Frame Camera')).toBe('cinema_camera')
      expect(detectKitCategory('Sony FX6 Cinema Line')).toBe('cinema_camera')
      expect(detectKitCategory('ARRI Alexa Mini LF')).toBe('cinema_camera')
      expect(detectKitCategory('Canon C70 Cinema EOS')).toBe('cinema_camera')
    })

    it('detects gimbals and stabilizers', () => {
      expect(detectKitCategory('DJI RS3 Pro Gimbal Stabilizer')).toBe('gimbal')
      expect(detectKitCategory('DJI RS4 Pro Combo')).toBe('gimbal')
      expect(detectKitCategory('DJI Ronin 2 3-Axis Gimbal')).toBe('gimbal')
    })

    it('detects wireless video systems', () => {
      expect(detectKitCategory('Accsoon CineEye 2S Pro Transmitter')).toBe('wireless_video')
      expect(detectKitCategory('Teradek Bolt 4K 750 Receiver')).toBe('wireless_video')
      expect(detectKitCategory('Hollyland Mars 400S Pro')).toBe('wireless_video')
    })

    it('detects lighting and grip equipment', () => {
      expect(detectKitCategory('Aputure 600x Pro Bi-Color Point Source')).toBe('lighting')
      expect(detectKitCategory('Nanlite Forza 500 LED Monolight')).toBe('lighting')
    })

    it('detects audio gear', () => {
      expect(detectKitCategory('DJI Mic 2 Wireless Microphone Set')).toBe('audio')
      expect(detectKitCategory('Sennheiser MKH 416 Shotgun Mic')).toBe('audio')
      expect(detectKitCategory('Sound Devices MixPre-6 II')).toBe('audio')
    })

    it('returns general for loose cables or grip accessories', () => {
      expect(detectKitCategory('HDMI Cable 2m Braided')).toBe('general')
      expect(detectKitCategory('Pelican 1510 TrekPak Case')).toBe('general')
    })
  })

  describe('getCinemaKitDependencies', () => {
    it('returns critical power and media checks for cinema cameras', () => {
      const deps = getCinemaKitDependencies('RED Komodo-X 6K')
      expect(deps.some((d) => d.id === 'media' && d.critical)).toBe(true)
      expect(deps.some((d) => d.id === 'power' && d.critical)).toBe(true)
      expect(deps.some((d) => d.id === 'mount' && d.critical)).toBe(true)
    })

    it('returns quick release plate as critical for gimbals', () => {
      const deps = getCinemaKitDependencies('DJI RS3 Pro')
      expect(deps.some((d) => d.id === 'plate' && d.critical)).toBe(true)
    })

    it('returns antennas as critical for wireless video transmitters', () => {
      const deps = getCinemaKitDependencies('Accsoon CineEye 2S Pro')
      expect(deps.some((d) => d.id === 'antennas' && d.critical)).toBe(true)
    })

    it('returns empty list for non-critical general accessories', () => {
      expect(getCinemaKitDependencies('Pelican 1510')).toEqual([])
    })
  })

  describe('evaluateKitCompleteness', () => {
    it('passes when no cinema gear is present in items', () => {
      const res = evaluateKitCompleteness([
        { key: 'item-1', name: 'Standard Light Stand' },
        { key: 'item-2', name: 'Cardellini Clamp' },
      ])
      expect(res.hasCinemaGear).toBe(false)
      expect(res.allCriticalPassed).toBe(true)
      expect(res.unverifiedCriticalItems).toHaveLength(0)
    })

    it('flags unverified critical dependencies when camera is added without checklist verification', () => {
      const res = evaluateKitCompleteness([
        { key: 'item-1', name: 'RED Komodo-X 6K' },
      ])
      expect(res.hasCinemaGear).toBe(true)
      expect(res.allCriticalPassed).toBe(false)
      expect(res.unverifiedCriticalItems.length).toBeGreaterThan(0)
      expect(res.unverifiedCriticalItems.some((u) => u.dependencyLabel.includes('Media'))).toBe(true)
    })

    it('passes once all critical dependencies are verified for cinema camera', () => {
      const res = evaluateKitCompleteness([
        {
          key: 'item-1',
          name: 'RED Komodo-X 6K',
          verifiedDependencyIds: ['media', 'power', 'mount'],
        },
      ])
      expect(res.hasCinemaGear).toBe(true)
      expect(res.allCriticalPassed).toBe(true)
      expect(res.unverifiedCriticalItems).toHaveLength(0)
      expect(res.verifiedCount).toBe(3)
    })
  })
})
