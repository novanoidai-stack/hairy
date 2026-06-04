import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: `
          html, body, #root {
            background-color: #f6f1ea !important;
          }
          * { box-sizing: border-box; }
        `}} />
      </head>
      <body style={{ backgroundColor: '#f6f1ea' }}>{children}</body>
    </html>
  );
}
