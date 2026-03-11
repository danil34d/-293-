import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const contentType = 'image/png';

const size = {
  width: 180,
  height: 180,
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
        background: '#f7fafc',
      }}
    >
      <div
        style={{
          width: 148,
          height: 148,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          borderRadius: 32,
          padding: 18,
          background: '#102033',
          color: '#f8fafc',
          border: '3px solid #315a83',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13,
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
            <span style={{ fontSize: 54, lineHeight: 1, fontWeight: 800 }}>M</span>
            <span style={{ fontSize: 18, lineHeight: 1, fontWeight: 700, letterSpacing: 2 }}>PRO</span>
          </div>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 999,
              background: '#22c55e',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 24, height: 8, borderRadius: 999, background: '#f8fafc' }} />
          <div style={{ width: 48, height: 8, borderRadius: 999, background: '#315a83' }} />
          <div style={{ width: 18, height: 8, borderRadius: 999, background: '#7dd3fc' }} />
        </div>
      </div>
    </div>
  );
}

export function GET() {
  return new ImageResponse(<IconMarkup />, size);
}
