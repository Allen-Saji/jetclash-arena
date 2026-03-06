import { WeaponStats } from '@/types';

export const PRIMARY_WEAPON: WeaponStats = {
  damage: 12,
  fireRate: 180,
  projectileSpeed: 700,
  projectileKey: 'bullet',
  ammo: 50,
  maxAmmo: 50,
  reloadTime: 1200,
};

export const SECONDARY_WEAPON: WeaponStats = {
  damage: 40,
  fireRate: 1200,
  projectileSpeed: 450,
  projectileKey: 'rocket',
  ammo: 5,
  maxAmmo: 5,
  reloadTime: 2500,
};
