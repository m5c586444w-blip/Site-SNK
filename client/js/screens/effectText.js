// Traduction des effets en langage clair (FEATURES_SPEC.md §6 : jamais d'enum brut à l'écran).
import { t, loc } from '../i18n.js';
import { RESEARCH_CATEGORIES } from '/shared/constants.js';

const sign = (x) => (x >= 0 ? '+' : '−');

export function effectText(e, view) {
  const nationName = (id) => loc(view.nations.find((n) => n.id === id)?.name) ?? t('map.menu.unknownTarget');
  const me = view.nations.find((n) => n.id === view.viewerId);
  switch (e.type) {
    case 'resourceBonus': return t('effect.resourceBonus', { sign: sign(e.amount), amount: Math.abs(e.amount), resource: t(`resource.${e.resource}`) });
    case 'modifyStability': return `${t('effect.modifyStability', { sign: sign(e.delta), delta: Math.abs(e.delta) })}${me?.stability == null ? ` ${t('effect.nullNote')}` : ''}`;
    case 'modifyWarSupport': return `${t('effect.modifyWarSupport', { sign: sign(e.delta), delta: Math.abs(e.delta) })}${me?.warSupport == null ? ` ${t('effect.nullNote')}` : ''}`;
    case 'unlockEquipment': return t('effect.unlockEquipment', { equipment: t(`equipment.${e.equipmentId}`) });
    case 'unlockTech': return RESEARCH_CATEGORIES.includes(e.techId)
      ? t('effect.unlockTechCategory', { category: t(`research.category.${e.techId}`) })
      : t('effect.unlockTech', { tech: loc(view.technologies?.find((x) => x.id === e.techId)?.name) ?? e.techId });
    case 'triggerEvent': return t('effect.triggerEvent', { event: e.eventId });
    case 'diplomaticAction': return e.action === 'establish_contact'
      ? t('effect.establish_contact', { nation: nationName(e.targetNationId) })
      : t('effect.improve_relations', { nation: nationName(e.targetNationId), sign: sign(e.amount ?? 0), amount: Math.abs(e.amount ?? 0) });
    case 'grantTitanPower': return t('effect.grantTitanPower', { titan: t(`titan.${e.titanId}`) });
    case 'reveal': return e.nationId === '*'
      ? t('effect.revealAll', { level: t(`effect.level.${e.level}`) })
      : t('effect.reveal', { nation: nationName(e.nationId), level: t(`effect.level.${e.level}`) });
    case 'setNationFlag': return t('effect.setNationFlag');
    case 'startWar': return t('effect.startWar', { a: nationName(e.nations[0]), b: nationName(e.nations[1]) });
    case 'transferTitanPowers': return t('effect.transferTitanPowers', { from: nationName(e.from), to: nationName(e.to) });
    case 'abandonWallRing': return t('effect.abandonWallRing');
    case 'devastateMainland': return t('effect.devastateMainland');
    case 'globalShock': return t('effect.globalShock');
    default: return e.type;
  }
}
