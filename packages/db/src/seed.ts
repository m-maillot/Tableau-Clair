import type { Database } from './client';
import {
  boardRows,
  boards,
  circuits,
  elements,
  fixtures,
  floors,
  memberships,
  properties,
  rooms,
  users,
} from './schema';

/**
 * Jeu de données de démonstration : un logement, un tableau de 3 rangées, un étage avec
 * deux pièces et quelques équipements dont les liaisons couvrent les trois statuts.
 * N'écrit rien si la base contient déjà des logements. Retourne vrai si des données ont été créées.
 */
export async function seedDemo(db: Database): Promise<boolean> {
  return db.transaction(async (tx) => {
    const existing = await tx.select({ id: properties.id }).from(properties).limit(1);
    if (existing.length > 0) return false;

    const [owner] = await tx
      .insert(users)
      .values({ email: 'demo@tableau-clair.test', displayName: 'Démo' })
      .onConflictDoNothing()
      .returning();
    const userId =
      owner?.id ??
      (await tx.query.users.findFirst({
        where: (u, { eq }) => eq(u.email, 'demo@tableau-clair.test'),
      }))!.id;

    const [home] = await tx
      .insert(properties)
      .values({ name: 'Maison (démo)', address: '1 rue du Rail DIN', updatedBy: userId })
      .returning();
    await tx.insert(memberships).values({ propertyId: home!.id, userId, role: 'owner' });

    const [board] = await tx
      .insert(boards)
      .values({
        propertyId: home!.id,
        name: 'Tableau principal',
        location: 'Entrée',
        rows: 3,
        modulesPerRow: 24,
        updatedBy: userId,
      })
      .returning();

    const rows = await tx
      .insert(boardRows)
      .values(
        [0, 1, 2].map((index) => ({ boardId: board!.id, index, capacity: 24, updatedBy: userId })),
      )
      .returning();
    const [row0, row1] = [rows.find((r) => r.index === 0)!, rows.find((r) => r.index === 1)!];

    const [rcd] = await tx
      .insert(elements)
      .values({
        rowId: row0.id,
        position: 0,
        width: 2,
        kind: 'rcd',
        label: 'Différentiel 40 A',
        ratingA: 40,
        poles: 2,
        sensitivityMa: 30,
        rcdType: 'A',
        updatedBy: userId,
      })
      .returning();

    const breakerValues = [
      { position: 2, label: 'Prises cuisine', ratingA: 20, cableSection: '2.5' },
      { position: 3, label: 'Éclairage', ratingA: 10, cableSection: '1.5' },
      { position: 4, label: 'Four', ratingA: 20, cableSection: '2.5' },
      { position: 5, label: 'Lave-linge', ratingA: 20, cableSection: '2.5' },
    ];
    const breakers = await tx
      .insert(elements)
      .values(
        breakerValues.map((b) => ({
          rowId: row0.id,
          width: 1,
          kind: 'breaker' as const,
          poles: 2,
          curve: 'C' as const,
          protectedByRcdId: rcd!.id,
          outgoingCables: 1,
          updatedBy: userId,
          ...b,
        })),
      )
      .returning();

    await tx.insert(elements).values([
      {
        rowId: row0.id,
        position: 6,
        width: 18,
        kind: 'spare',
        label: 'Réserve',
        updatedBy: userId,
      },
      {
        rowId: row1.id,
        position: 0,
        width: 1,
        kind: 'hphc_contactor',
        label: 'Cumulus',
        ratingA: 20,
        updatedBy: userId,
      },
    ]);

    const [floor] = await tx
      .insert(floors)
      .values({
        propertyId: home!.id,
        name: 'Rez-de-chaussée',
        index: 0,
        width: 1000,
        height: 700,
        updatedBy: userId,
      })
      .returning();
    const [kitchen, hall] = await tx
      .insert(rooms)
      .values([
        { floorId: floor!.id, name: 'Cuisine', x: 40, y: 40, w: 360, h: 300, updatedBy: userId },
        { floorId: floor!.id, name: 'Entrée', x: 420, y: 40, w: 240, h: 300, updatedBy: userId },
      ])
      .returning();

    const fixtureRows = await tx
      .insert(fixtures)
      .values([
        {
          roomId: kitchen!.id,
          kind: 'socket',
          label: 'Prise plan de travail',
          x: 80,
          y: 60,
          updatedBy: userId,
        },
        {
          roomId: kitchen!.id,
          kind: 'appliance',
          label: 'Four',
          x: 300,
          y: 120,
          updatedBy: userId,
        },
        {
          roomId: hall!.id,
          kind: 'light',
          label: 'Plafonnier entrée',
          x: 520,
          y: 140,
          updatedBy: userId,
        },
        {
          roomId: hall!.id,
          kind: 'socket',
          label: 'Prise à identifier',
          x: 600,
          y: 300,
          updatedBy: userId,
        },
      ])
      .returning();

    const byLabel = (rows: { label: string; id: string }[], label: string) =>
      rows.find((r) => r.label === label)!.id;

    await tx.insert(circuits).values([
      {
        fixtureId: byLabel(fixtureRows, 'Prise plan de travail'),
        breakerId: byLabel(breakers, 'Prises cuisine'),
        status: 'verified',
        updatedBy: userId,
      },
      {
        fixtureId: byLabel(fixtureRows, 'Four'),
        breakerId: byLabel(breakers, 'Four'),
        status: 'assumed',
        updatedBy: userId,
      },
      {
        fixtureId: byLabel(fixtureRows, 'Plafonnier entrée'),
        breakerId: byLabel(breakers, 'Éclairage'),
        status: 'assumed',
        updatedBy: userId,
      },
      // « Prise à identifier » : aucun circuit → apparaît dans « À vérifier ».
    ]);

    return true;
  });
}
