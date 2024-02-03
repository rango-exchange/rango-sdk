import React from 'react'
import ReactDOM from 'react-dom'
import './index.css'
import App from './App'
import { RangoClientContextProvider } from './hooks/useRangoClient'
import { MetaContextProvider } from './hooks/useMeta'
import { MessagingProtocolsContextProvider } from './hooks/useMessagingProtocols'

ReactDOM.render(
  <React.StrictMode>
    <RangoClientContextProvider>
      <MetaContextProvider>
        <MessagingProtocolsContextProvider>
          <App />
        </MessagingProtocolsContextProvider>
      </MetaContextProvider>
    </RangoClientContextProvider>
  </React.StrictMode>,
  document.getElementById('root')
)
