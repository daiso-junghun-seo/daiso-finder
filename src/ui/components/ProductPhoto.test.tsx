import { fireEvent, render, screen } from '@testing-library/react';
import { ProductPhoto } from './ProductPhoto';

test('renders the photo with the product name as alt', () => {
  render(
    <ProductPhoto
      imageUrl="https://cdn.daisomall.co.kr/file/PD/test.jpg"
      name="리빙 밀폐용기 1.2L"
    />,
  );
  expect(screen.getByRole('img', { name: '리빙 밀폐용기 1.2L' })).toBeInTheDocument();
});

test('no URL renders nothing (never a fake placeholder)', () => {
  const { container } = render(<ProductPhoto name="리빙 밀폐용기 1.2L" />);
  expect(container).toBeEmptyDOMElement();
});

test('a URL that fails to load unmounts instead of painting a broken glyph', () => {
  render(
    <ProductPhoto
      imageUrl="https://cdn.daisomall.co.kr/file/PD/missing.jpg"
      name="리빙 밀폐용기 1.2L"
    />,
  );
  const img = screen.getByRole('img', { name: '리빙 밀폐용기 1.2L' });
  // jsdom never loads images, so drive the error path directly — it is the path a vendor 404
  // takes in production.
  fireEvent.error(img);
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
