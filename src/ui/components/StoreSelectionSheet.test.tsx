import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMockStoreDirectory, mockStores } from '../../adapters/mock/storeDirectory';
import type { GeolocationPort, StoreDirectoryPort } from '../../domain/ports';
import {
  STORE_SELECT_CLOSE,
  STORE_SELECT_NEARBY_HEADER,
  STORE_SELECT_NO_LOCATION_NOTE,
  STORE_SELECT_SEARCH_PLACEHOLDER,
  STORE_SELECT_TITLE,
} from '../copy';
import { StoreSelectionSheet } from './StoreSelectionSheet';

const directory: StoreDirectoryPort = createMockStoreDirectory();
const geoWithStores: GeolocationPort = { getNearbyStores: async () => mockStores };
const geoEmpty: GeolocationPort = { getNearbyStores: async () => [] };

test('renders as a labelled modal dialog with the nearby list when GPS recommends stores', async () => {
  render(
    <StoreSelectionSheet
      current={{ strCd: '001', strNm: '명동역점' }}
      directory={directory}
      geolocation={geoWithStores}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
  const dialog = await screen.findByRole('dialog', { name: STORE_SELECT_TITLE });
  expect(dialog).toHaveAttribute('aria-modal', 'true');
  expect(await screen.findByText(STORE_SELECT_NEARBY_HEADER)).toBeInTheDocument();
  expect(await screen.findByRole('button', { name: '명동역점 · 120m' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '을지로점 · 600m' })).toBeInTheDocument();
});

test('marks the current store row with aria-current', async () => {
  render(
    <StoreSelectionSheet
      current={{ strCd: '001', strNm: '명동역점' }}
      directory={directory}
      geolocation={geoWithStores}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
  const row = await screen.findByRole('button', { name: '명동역점 · 120m' });
  expect(row).toHaveAttribute('aria-current', 'true');
});

test('tapping a nearby row selects that store', async () => {
  const onSelect = vi.fn();
  render(
    <StoreSelectionSheet
      current={{ strCd: '001', strNm: '명동역점' }}
      directory={directory}
      geolocation={geoWithStores}
      onSelect={onSelect}
      onClose={() => {}}
    />,
  );
  await userEvent.click(await screen.findByRole('button', { name: '명동중앙점 · 340m' }));
  expect(onSelect).toHaveBeenCalledWith({ strCd: '002', strNm: '명동중앙점' });
});

test('no location → shows the note and focuses the search field (Interface §4)', async () => {
  render(
    <StoreSelectionSheet
      current={{ strCd: '001', strNm: '명동역점' }}
      directory={directory}
      geolocation={geoEmpty}
      onSelect={() => {}}
      onClose={() => {}}
    />,
  );
  expect(await screen.findByText(STORE_SELECT_NO_LOCATION_NOTE)).toBeInTheDocument();
  const input = screen.getByPlaceholderText(STORE_SELECT_SEARCH_PLACEHOLDER);
  await waitFor(() => expect(input).toHaveFocus());
});

test('typing searches the directory and tapping a result selects it', async () => {
  const onSelect = vi.fn();
  render(
    <StoreSelectionSheet
      current={null}
      directory={directory}
      geolocation={geoEmpty}
      onSelect={onSelect}
      onClose={undefined}
    />,
  );
  await userEvent.type(screen.getByPlaceholderText(STORE_SELECT_SEARCH_PLACEHOLDER), '을지로');
  await userEvent.click(await screen.findByRole('button', { name: '을지로점' }));
  expect(onSelect).toHaveBeenCalledWith({ strCd: '003', strNm: '을지로점' });
});

test('닫기 shows only when onClose is provided (first run hides it)', async () => {
  const onClose = vi.fn();
  const { rerender } = render(
    <StoreSelectionSheet
      current={{ strCd: '001', strNm: '명동역점' }}
      directory={directory}
      geolocation={geoEmpty}
      onSelect={() => {}}
      onClose={onClose}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: STORE_SELECT_CLOSE }));
  expect(onClose).toHaveBeenCalled();
  rerender(
    <StoreSelectionSheet
      current={null}
      directory={directory}
      geolocation={geoEmpty}
      onSelect={() => {}}
      onClose={undefined}
    />,
  );
  expect(screen.queryByRole('button', { name: STORE_SELECT_CLOSE })).not.toBeInTheDocument();
});
