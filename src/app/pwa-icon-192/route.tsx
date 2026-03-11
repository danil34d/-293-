import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const contentType = 'image/png';

const size = {
  width: 192,
  height: 192,
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
          width: 156,
          height: 156,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRadius: 34,
          padding: 18,
          background: '#102033',
          color: '#f8fafc',
          boxShadow: '0 8px 28px rgba(16, 32, 51, 0.25)',
          border: '3px solid #315a83',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 2,
            color: '#7dd3fc',
          }}
        >
          <span>CAR</span>
          <span>WASH</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 58, lineHeight: 1, fontWeight: 800 }}>M</span>
            <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 700, letterSpacing: 2 }}>PRO</span>
          </div>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 999,
              background: '#22c55e',
              boxShadow: '0 0 0 10px rgba(34, 197, 94, 0.12)',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 28, height: 8, borderRadius: 999, background: '#f8fafc' }} />
          <div style={{ width: 54, height: 8, borderRadius: 999, background: '#315a83' }} />
          <div style={{ width: 18, height: 8, borderRadius: 999, background: '#7dd3fc' }} />
        </div>
      </div>
    </div>
  );
}

export function GET() {
  return new ImageResponse(<IconMarkup />, size);
}
