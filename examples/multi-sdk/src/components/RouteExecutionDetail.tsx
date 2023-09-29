type RouteExecutionDetailProps = {
  logs: string[]
}

export default function RouteExecutionDetail(props: RouteExecutionDetailProps) {
  const { logs } = props
  return (
    <>
      {logs?.length > 0 && (
        <div className="py-3 bg-white text-primary text-sm">
          <div>Execition Details:</div>
          <ul className="text-left px-8 text-blue-800">
            {logs?.map((log, i) => (
              <li key={i}>- {log}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
