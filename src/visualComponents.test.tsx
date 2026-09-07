import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { ConcentricStageRings } from './ConcentricStageRings';
import { WarehouseProcessFlow } from './WarehouseProcessFlow';
import { TruckLoadingDiagram } from './TruckLoadingDiagram';
import { StageDistributionBar } from './StageDistributionBar';

describe('Apple Glass Visual Components Test Suite', () => {
  describe('ConcentricStageRings', () => {
    it('renders concentric activity rings with clamped percentages', () => {
      const html = renderToString(
        <ConcentricStageRings
          prep={{ done: 5, total: 10, percent: 50 }}
          load={{ done: 2, total: 10, percent: 20 }}
          point={{ done: 10, total: 10, percent: 100 }}
          size="sm"
          showCenterText={true}
        />
      );

      expect(html).toContain('concentric-rings-wrapper');
      expect(html).toContain('svg');
      expect(html).toContain('Préparation: 50%');
      expect(html).toContain('Chargement: 20%');
      expect(html).toContain('Pointage: 100%');
      expect(html).toContain('57');
    });

    it('handles 0% and 100% boundary cases correctly', () => {
      const htmlZero = renderToString(
        <ConcentricStageRings
          prep={{ done: 0, total: 10, percent: 0 }}
          load={{ done: 0, total: 10, percent: 0 }}
          point={{ done: 0, total: 10, percent: 0 }}
          size="md"
          showCenterText={true}
        />
      );
      expect(htmlZero).toContain('0');

      const htmlFull = renderToString(
        <ConcentricStageRings
          prep={{ done: 10, total: 10, percent: 100 }}
          load={{ done: 10, total: 10, percent: 100 }}
          point={{ done: 10, total: 10, percent: 100 }}
          size="lg"
          showCenterText={true}
        />
      );
      expect(htmlFull).toContain('svg');
    });
  });

  describe('WarehouseProcessFlow', () => {
    it('renders pipeline stages with active indicators and percentages', () => {
      const html = renderToString(
        <WarehouseProcessFlow
          currentStage="chargement"
          onSelectStage={() => {}}
          metrics={{
            preparation: { done: 10, total: 10, percent: 100 },
            chargement: { done: 4, total: 10, percent: 40 },
            pointage: { done: 0, total: 10, percent: 0 },
          }}
        />
      );

      expect(html).toContain('warehouse-flow-container');
      expect(html).toContain('Prépa');
      expect(html).toContain('Chargement');
      expect(html).toContain('Pointage');
      expect(html).toContain('100');
      expect(html).toContain('40');
      expect(html).toContain('0');
    });
  });

  describe('TruckLoadingDiagram', () => {
    it('renders cargo bay and dock staging with accurate counts', () => {
      const html = renderToString(
        <TruckLoadingDiagram
          tripNumber={1}
          totalTrips={2}
          loadedContainersCount={3}
          loadedUnitsCount={45}
          dockRemainingContainersCount={2}
          dockRemainingUnitsCount={30}
          isFullyShipped={false}
        />
      );

      expect(html).toContain('Plan de Chargement — Voyage');
      expect(html).toContain('Dans ce Camion');
      expect(html).toContain('45');
      expect(html).toContain('colis');
      expect(html).toContain('Reste à Quai');
      expect(html).toContain('30');
      expect(html).toContain('En rotation');
    });

    it('renders fully shipped status when all cargo is dispatched', () => {
      const html = renderToString(
        <TruckLoadingDiagram
          tripNumber={2}
          totalTrips={2}
          loadedContainersCount={5}
          loadedUnitsCount={75}
          dockRemainingContainersCount={0}
          dockRemainingUnitsCount={0}
          isFullyShipped={true}
        />
      );

      expect(html).toContain('Expédition Complète');
      expect(html).toContain('Quai libéré');
    });
  });

  describe('StageDistributionBar', () => {
    it('renders segmented capsule bar with calculated conformity proportions', () => {
      const html = renderToString(
        <StageDistributionBar
          total={10}
          conforme={8}
          shortCount={1}
          overCount={1}
          problemCount={0}
        />
      );

      expect(html).toContain('stage-distribution-card');
      expect(html).toContain('Répartition de Conformité');
      expect(html).toContain('conforme');
      expect(html).toContain('Conformes');
      expect(html).toContain('Manquants');
      expect(html).toContain('Excédent');
    });
  });
});
