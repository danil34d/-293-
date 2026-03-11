import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const contentType = 'image/png';

const size = {
  width: 512,
  height: 512,
};

function IconMarkup() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(145deg, #f7fafc 0%, #e2e8f0 100%)',
      }}
    >
      <div
        style={{
          width: 420,
          height: 420,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRadius: 88,
          padding: 48,
          background: '#102033',
          color: '#f8fafc',
          boxShadow: '0 24px 60px rgba(16, 32, 51, 0.25)',
          border: '8px solid #315a83',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 34,
            fontWeight: 700,
            letterSpacing: 6,
            color: '#7dd3fc',
          }}
        >
          <span>CAR</span>
          <span>WASH</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 164, lineHeight: 1, fontWeight: 800 }}>M</span>
            <span style={{ fontSize: 50, lineHeight: 1, fontWeight: 700, letterSpacing: 6 }}>PRO</span>
          </div>
          <div
            style={{
              width: 108,
              height: 108,
              borderRadius: 999,
              background: '#22c55e',
              boxShadow: '0 0 0 28px rgba(34, 197, 94, 0.12)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 18 }}>
          <div style={{ width: 82, height: 22, borderRadius: 999, background: '#f8fafc' }} />
          <div style={{ width: 156, height: 22, borderRadius: 999, background: '#315a83' }} />
          <div style={{ width: 56, height: 22, borderRadius: 999, background: '#7dd3fc' }} />
        </div>
      </div>
    </div>
  );
}

export function GET() {
  return new ImageResponse(<IconMarkup />, size);
}
