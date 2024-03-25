import { TextField } from '@rango-dev/ui'
import React, { memo } from 'react'
import { useRangoClient } from '../../hooks/useRangoClient'

const APIKeyInput = () => {
  const { rangoApiKey, handleRangoApiKeyChange } = useRangoClient()

  return (
    <TextField
      placeholder="API Key"
      value={rangoApiKey}
      onChange={(e) => handleRangoApiKeyChange(e.target.value)}
      size="medium"
      style={{
        position: 'relative',
        backgroundColor: '$background !important',
      }}
      onResize={undefined}
      onResizeCapture={undefined}
      crossOrigin={undefined}
    />
  )
}

export default memo(APIKeyInput)
